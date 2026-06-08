import { create } from 'zustand';
import type {
  GameConfig,
  GameState,
  FeatureState,
  GridResult,
  RoundResult,
  GameEvent,
  AnimationType,
} from '@/types';
import { defaultConfig } from '@/config/defaultConfig';
import { createSession, type Session } from './session';
import { emptyGrid } from '@/engine/grid';
import { applyCheats, type CheatKind, type CheatState } from '@/engine/cheats';
import { resolveBuy } from '@/engine/buyFeature';
import { runSimulation, type SimulationReport } from '@/engine/simulation';
import { StatisticsEngine, type StatsSnapshot } from '@/engine/statistics';
import { clone } from '@/lib/utils';

type Speed = 'normal' | 'turbo';

interface RtpSample {
  round: number;
  rtp: number;
}

/** One step of the visual spin replay (landed board, then each cascade board). */
export interface PresentationStep {
  grid: GridResult;
  /** "col:row" of winning cells at this step (highlight then remove). */
  winCells: string[];
}

/** Everything the SlotCanvas needs to animate one spin, per animation mode. */
export interface Presentation {
  id: number;
  mode: AnimationType;
  spinTimeMs: number;
  stopIntervalMs: number;
  bounceMs: number;
  steps: PresentationStep[];
}

interface GameStore {
  /* config & rng */
  config: GameConfig;
  useFixedSeed: boolean;
  seed: number;

  /* wallet & bet */
  balance: number;
  bet: number;
  speed: Speed;
  animationEnabled: boolean;

  /* live lifecycle */
  state: GameState;
  featureState: FeatureState;
  spinning: boolean;
  displayGrid: GridResult;
  presentation: Presentation | null;
  roundWin: number;
  lastRound: RoundResult | null;
  reelStops: number[];
  roundId: number;
  spinId: number;
  cascadeId: number;
  activeFeature: string | null;

  /* logs & stats */
  events: GameEvent[];
  stats: StatsSnapshot;
  rtpHistory: RtpSample[];

  /* cheats */
  cheats: CheatState;

  /* auto spin */
  autoRemaining: number;
  autoInfinite: boolean;

  /* simulation */
  simRunning: boolean;
  simProgress: number;
  simReport: SimulationReport | null;

  /* actions */
  init: () => void;
  spin: () => void;
  stopSpin: () => void;
  finishPresentation: () => void;
  buy: (optionId: string) => void;
  setBet: (bet: number) => void;
  setSpeed: (s: Speed) => void;
  toggleAnimation: () => void;
  setSeedMode: (fixed: boolean, seed?: number) => void;
  armCheat: (kind: CheatKind, maxWinX?: number) => void;
  clearCheats: () => void;
  updateConfig: (mutator: (c: GameConfig) => void) => void;
  resetConfig: () => void;
  startAuto: (count: number | 'inf') => void;
  stopAuto: () => void;
  startSim: (rounds: number) => Promise<void>;
  clearStats: () => void;
  clearEvents: () => void;
}

/* module-scoped, non-reactive handles */
let session: Session = createSession(defaultConfig, 0);
let liveStats = new StatisticsEngine();
let presentationSeq = 0;
let pendingRound: RoundResult | null = null;
let pendingFinalGrid: GridResult | null = null;

export const useGameStore = create<GameStore>((set, get) => ({
  config: clone(defaultConfig),
  useFixedSeed: false,
  seed: 123456,

  balance: defaultConfig.user.balance,
  bet: defaultConfig.bet.default,
  speed: 'normal',
  animationEnabled: true,

  state: 'IDLE',
  featureState: 'INACTIVE',
  spinning: false,
  displayGrid: emptyGrid(defaultConfig.grid.shape, 'LJ'),
  presentation: null,
  roundWin: 0,
  lastRound: null,
  reelStops: [],
  roundId: 0,
  spinId: 0,
  cascadeId: 0,
  activeFeature: null,

  events: [],
  stats: liveStats.snapshot(),
  rtpHistory: [],

  cheats: { armed: [], maxWinX: 5000 },

  autoRemaining: 0,
  autoInfinite: false,

  simRunning: false,
  simProgress: 0,
  simReport: null,

  /* ------------------------------ init ------------------------------ */
  init: () => {
    const { config, useFixedSeed, seed } = get();
    session = createSession(config, useFixedSeed ? seed : null);
    liveStats = new StatisticsEngine();
    set({
      balance: config.user.balance,
      bet: config.bet.default,
      displayGrid: emptyGrid(config.grid.shape, config.symbols.at(-1)?.id ?? 'LJ'),
      events: [],
      stats: liveStats.snapshot(),
      rtpHistory: [],
      roundWin: 0,
      lastRound: null,
      state: 'IDLE',
    });
  },

  /* ------------------------------ spin ------------------------------ */
  spin: () => {
    const st = get();
    if (st.spinning) {
      // pressing during a spin = quick-stop (急停): reveal immediately
      get().stopSpin();
      return;
    }
    if (st.balance < st.bet) return;

    const { engine, log, stats } = session;

    // build play options (cheats injected here)
    const play = applyCheats(st.config, { bet: st.bet }, st.cheats);

    set({ spinning: true, roundWin: 0, balance: st.balance - st.bet });

    const round = engine.playRound(play);

    // accumulate live stats
    stats.record(round);
    liveStats.record(round);
    const snap = stats.snapshot();
    const rtpHistory = [...st.rtpHistory, { round: snap.totalRounds, rtp: snap.actualRTP }].slice(-500);

    const base = round.spins[0];
    const finalGrid = base?.gridSteps.at(-1) ?? base?.grid ?? st.displayGrid;

    // snapshot debug + events immediately (board reveal is deferred to canvas)
    set({
      lastRound: round,
      reelStops: engine.lastReelStops,
      roundId: log.roundId,
      spinId: log.spinId,
      cascadeId: log.cascadeId,
      state: engine.state,
      featureState: engine.featureState,
      activeFeature: engine.activeFeature,
      events: [...log.list()].slice(-400),
      stats: snap,
      rtpHistory,
      cheats: { ...st.cheats, armed: [] },
    });

    pendingRound = round;
    pendingFinalGrid = finalGrid;

    // no-animation fast path: settle instantly
    if (!st.animationEnabled) {
      get().finishPresentation();
      return;
    }

    // build the presentation timeline the SlotCanvas will play out
    const profile = st.speed === 'turbo' ? st.config.animation.turbo : st.config.animation.normal;
    const steps: PresentationStep[] = (base?.gridSteps ?? []).map((g, i) => ({
      grid: g,
      winCells: (base!.cascades[i]?.wins ?? []).flatMap((w) =>
        w.cells.map((c) => `${c.col}:${c.row}`),
      ),
    }));
    if (steps.length === 0) steps.push({ grid: finalGrid, winCells: [] });

    set({
      presentation: {
        id: ++presentationSeq,
        mode: st.config.animation.type,
        spinTimeMs: profile.totalSpinTime,
        stopIntervalMs: profile.stopInterval,
        bounceMs: profile.bounceDuration,
        steps,
      },
    });
  },

  // Called by the SlotCanvas when its animation timeline completes (or on
  // quick-stop). Idempotent: consumes the pending round exactly once.
  finishPresentation: () => {
    if (!pendingRound) return;
    const round = pendingRound;
    const finalGrid = pendingFinalGrid ?? get().displayGrid;
    pendingRound = null;
    pendingFinalGrid = null;

    set((s) => ({
      spinning: false,
      presentation: null,
      displayGrid: finalGrid,
      roundWin: round.totalWin,
      balance: s.balance + round.totalWin,
      state: 'IDLE',
    }));

    // auto-spin continuation
    const cur = get();
    if (cur.autoInfinite) {
      if (cur.balance >= cur.bet) setTimeout(() => get().spin(), 150);
      else set({ autoInfinite: false });
    } else if (cur.autoRemaining > 0) {
      const left = cur.autoRemaining - 1;
      set({ autoRemaining: left });
      if (left > 0 && cur.balance >= cur.bet) setTimeout(() => get().spin(), 150);
    }
  },

  stopSpin: () => {
    get().finishPresentation();
  },

  /* ------------------------------ buy ------------------------------- */
  buy: (optionId) => {
    const st = get();
    if (st.spinning) return;
    const res = resolveBuy(st.config, optionId, st.bet);
    if (!res || st.balance < res.cost) return;

    const { engine, log, stats } = session;
    set({ balance: st.balance - res.cost, roundWin: 0 });
    log.emit('BUY', { option: res.option.id, cost: res.cost });

    const round = engine.playRound(res.play);
    stats.record(round);
    liveStats.record(round);
    const snap = stats.snapshot();

    set((s) => ({
      spinning: false,
      displayGrid: round.spins[0]?.gridSteps.at(-1) ?? round.spins[0]?.grid ?? s.displayGrid,
      roundWin: round.totalWin,
      balance: s.balance + round.totalWin,
      lastRound: round,
      reelStops: engine.lastReelStops,
      roundId: log.roundId,
      spinId: log.spinId,
      state: engine.state,
      featureState: engine.featureState,
      events: [...log.list()].slice(-400),
      stats: snap,
      rtpHistory: [...s.rtpHistory, { round: snap.totalRounds, rtp: snap.actualRTP }].slice(-500),
    }));
  },

  /* --------------------------- settings ----------------------------- */
  setBet: (bet) => set({ bet }),
  setSpeed: (speed) => set({ speed }),
  toggleAnimation: () => set((s) => ({ animationEnabled: !s.animationEnabled })),

  setSeedMode: (fixed, seed) => {
    set({ useFixedSeed: fixed, seed: seed ?? get().seed });
    get().init();
  },

  armCheat: (kind, maxWinX) =>
    set((s) => ({
      cheats: {
        armed: s.cheats.armed.includes(kind) ? s.cheats.armed : [...s.cheats.armed, kind],
        maxWinX: maxWinX ?? s.cheats.maxWinX,
      },
    })),

  clearCheats: () => set((s) => ({ cheats: { ...s.cheats, armed: [] } })),

  updateConfig: (mutator) => {
    const next = clone(get().config);
    mutator(next);
    set({ config: next });
    // rebuild engine session against new config (keeps seed mode)
    const { useFixedSeed, seed } = get();
    session = createSession(next, useFixedSeed ? seed : null);
    set({
      displayGrid: emptyGrid(next.grid.shape, next.symbols.at(-1)?.id ?? 'LJ'),
    });
  },

  resetConfig: () => {
    set({ config: clone(defaultConfig) });
    get().init();
  },

  /* --------------------------- auto spin ---------------------------- */
  startAuto: (count) => {
    if (count === 'inf') set({ autoInfinite: true, autoRemaining: 0 });
    else set({ autoInfinite: false, autoRemaining: count });
    if (!get().spinning) get().spin();
  },
  stopAuto: () => set({ autoInfinite: false, autoRemaining: 0 }),

  /* --------------------------- simulation --------------------------- */
  startSim: async (rounds) => {
    if (get().simRunning) return;
    set({ simRunning: true, simProgress: 0, simReport: null });
    const { config, useFixedSeed, seed, bet } = get();
    const report = await runSimulation(config, {
      rounds,
      bet,
      seed: useFixedSeed ? seed : null,
      chunk: Math.max(1000, Math.floor(rounds / 100)),
      onProgress: (done, total, partial) => {
        set({
          simProgress: done / total,
          stats: partial,
        });
      },
    });
    set({ simRunning: false, simProgress: 1, simReport: report, stats: report });
  },

  clearStats: () => {
    session.stats.reset();
    liveStats.reset();
    set({ stats: session.stats.snapshot(), rtpHistory: [], simReport: null });
  },
  clearEvents: () => {
    session.log.clear();
    set({ events: [] });
  },
}));
