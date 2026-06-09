import { create } from 'zustand';
import type {
  GameConfig,
  GameState,
  FeatureState,
  GridResult,
  RoundResult,
  SpinResult,
  GameEvent,
  AnimationType,
} from '@/types';
import { defaultConfig } from '@/config/defaultConfig';
import { createSession, type Session } from './session';
import { emptyGrid } from '@/engine/grid';
import { applyCheats, type CheatState } from '@/engine/cheats';
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
  /** Win amount resolved at this step (for the 連爆 per-step display). */
  winAmount: number;
}

/** Everything the SlotCanvas needs to animate one spin, per animation mode. */
export interface Presentation {
  id: number;
  mode: AnimationType;
  spinTimeMs: number;
  stopIntervalMs: number;
  bounceMs: number;
  /** Whether this spin should replay cascade steps (連爆 enabled). */
  cascade: boolean;
  /** Show each cascade step's win during the replay. */
  showStepWin: boolean;
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
  /** Banner shown while a feature's extra spins play out (e.g. "免費遊戲 3 / 10"). */
  featureLabel: string | null;
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
  simRtpHistory: RtpSample[];

  /* fake collect (假收集) — persistent pots above the board */
  collectPots: CollectPot[] | null;

  /* actions */
  init: () => void;
  spin: () => void;
  advanceFakeCollect: (onComplete?: () => void) => void;
  stopSpin: () => void;
  finishPresentation: () => void;
  buy: (optionId: string) => void;
  setBet: (bet: number) => void;
  setSpeed: (s: Speed) => void;
  toggleAnimation: () => void;
  setSeedMode: (fixed: boolean, seed?: number) => void;
  armTrigger: (id: string) => void;
  armMaxWin: (on: boolean, x?: number) => void;
  clearCheats: () => void;
  updateConfig: (mutator: (c: GameConfig) => void) => void;
  resetConfig: () => void;
  startAuto: (count: number | 'inf') => void;
  stopAuto: () => void;
  startSim: (rounds: number) => Promise<void>;
  clearStats: () => void;
  clearEvents: () => void;

  /* named seeds */
  seedName: string;
  savedSeeds: { name: string; seed: number }[];
  setSeedName: (name: string) => void;
  saveSeed: () => void;
  loadSeed: (seed: number, name: string) => void;
  deleteSeed: (name: string) => void;
}

const SEED_KEY = 'slot.savedSeeds';
function loadSavedSeeds(): { name: string; seed: number }[] {
  try {
    const raw = localStorage.getItem(SEED_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
function persistSeeds(list: { name: string; seed: number }[]): void {
  try {
    localStorage.setItem(SEED_KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable — keep in-memory only */
  }
}

/** One pot sitting ABOVE a reel. Persistent while 假收集 is enabled. */
export interface CollectPot {
  col: number; // reel index the pot sits above
  stage: number;
}

/* module-scoped, non-reactive handles */
let session: Session = createSession(defaultConfig, 0);
let liveStats = new StatisticsEngine();
let presentationSeq = 0;
let pendingRound: RoundResult | null = null;
let fcTimers: number[] = [];

/* feature-spin playback queue: each round's spins are animated one after another
   (base spin, then any feature/free-game spins) instead of resolving instantly */
let spinQueue: SpinResult[] = [];
let currentSpinFinalGrid: GridResult | null = null;
let currentSpinWin = 0;
let accumulatedWin = 0;
let featureTotal = 0;
let featureDone = 0;

function featureName(kind: string): string {
  switch (kind) {
    case 'freegame':
    case 'free':
      return '免費遊戲';
    case 'respin':
      return '重轉 Respin';
    case 'hold':
      return 'Hold & Spin';
    default:
      return '額外遊戲';
  }
}

/** Build the SlotCanvas presentation timeline for a single spin. */
function buildPresentation(
  spin: SpinResult,
  config: GameConfig,
  turbo: boolean,
  fallback: GridResult,
  bet: number,
): Presentation {
  const profile = turbo ? config.animation.turbo : config.animation.normal;
  const steps: PresentationStep[] = (spin.gridSteps ?? []).map((g, i) => ({
    grid: g,
    winCells: (spin.cascades[i]?.wins ?? []).flatMap((w) => w.cells.map((c) => `${c.col}:${c.row}`)),
    winAmount: (spin.cascades[i]?.totalPay ?? 0) * bet,
  }));
  if (steps.length === 0) steps.push({ grid: spin.gridSteps?.at(-1) ?? fallback, winCells: [], winAmount: 0 });
  return {
    id: ++presentationSeq,
    mode: config.animation.type,
    spinTimeMs: profile.totalSpinTime,
    stopIntervalMs: profile.stopInterval,
    bounceMs: profile.bounceDuration,
    cascade: config.cascade?.enabled ?? false,
    showStepWin: true, // 連爆 always shows each step's win
    steps,
  };
}

/**
 * Reconcile the persistent pots with the current config: one pot above each of
 * the first `count` reels, preserving stages of pots that already exist. Returns
 * null when 假收集 is disabled.
 */
function reconcileCollect(config: GameConfig, prev: CollectPot[] | null): CollectPot[] | null {
  const fc = config.fakeCollect;
  if (!fc?.enabled || fc.count <= 0) return null;
  const n = Math.max(0, Math.min(fc.count, config.grid.cols));
  return Array.from({ length: n }, (_, col) => ({ col, stage: prev?.[col]?.stage ?? 1 }));
}

/** Roll a pot's next stage from the upgrade weight matrix. */
function rollStage(s: number, cfg: NonNullable<GameConfig['fakeCollect']>): number {
  const row = cfg.upgrade[s - 1];
  if (!row) return s;
  const opts: { stage: number; w: number }[] = [{ stage: s, w: Math.max(0, row.stay) }];
  for (let k = 0; k < 4; k++) {
    if (s + (k + 1) <= cfg.stages) opts.push({ stage: s + (k + 1), w: Math.max(0, row.up[k] ?? 0) });
  }
  const total = opts.reduce((a, o) => a + o.w, 0);
  if (total <= 0) return s;
  let r = Math.random() * total;
  for (const o of opts) {
    if (r < o.w) return o.stage;
    r -= o.w;
  }
  return s;
}

export const useGameStore = create<GameStore>((set, get) => {
  /* ---- feature-spin playback helpers (close over set / get) ---- */

  // Animate the next queued spin (base spin first, then any feature spins).
  const playNextSpin = () => {
    const spin = spinQueue.shift();
    if (!spin) return;
    currentSpinFinalGrid = spin.gridSteps?.at(-1) ?? spin.grid;
    currentSpinWin = spin.spinWin;
    let label: string | null = null;
    if (spin.kind !== 'normal') {
      featureDone++;
      label = `${featureName(spin.kind)} ${featureDone} / ${featureTotal}`;
    }
    const st = get();
    set({
      presentation: buildPresentation(spin, st.config, st.speed === 'turbo', st.displayGrid, st.bet),
      featureLabel: label,
    });
  };

  // Finish the whole round: credit the authoritative total once, then continue
  // with the fake-collect overlay and any auto-spin.
  const finalizeRound = () => {
    const round = pendingRound;
    pendingRound = null;
    spinQueue = [];
    if (!round) return;

    set((s) => ({
      spinning: false,
      presentation: null,
      featureLabel: null,
      displayGrid: currentSpinFinalGrid ?? s.displayGrid,
      roundWin: round.totalWin,
      balance: s.balance + round.totalWin,
      state: 'IDLE',
    }));

    const continueAuto = () => {
      const cur = get();
      const prof = cur.speed === 'turbo' ? cur.config.animation.turbo : cur.config.animation.normal;
      const gap = Math.max(0, prof.roundGap ?? 500);
      if (cur.autoInfinite) {
        if (cur.balance >= cur.bet) setTimeout(() => get().spin(), gap);
        else set({ autoInfinite: false });
      } else if (cur.autoRemaining > 0) {
        const left = cur.autoRemaining - 1;
        set({ autoRemaining: left });
        if (left > 0 && cur.balance >= cur.bet) setTimeout(() => get().spin(), gap);
      }
    };

    const fc = get().config.fakeCollect;
    if (fc?.enabled && get().collectPots) get().advanceFakeCollect(continueAuto);
    else continueAuto();
  };

  return {
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
  featureLabel: null,
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

  cheats: { armedTriggers: [], forceMaxWin: false, maxWinX: 5000 },

  autoRemaining: 0,
  autoInfinite: false,

  simRunning: false,
  simProgress: 0,
  simReport: null,
  simRtpHistory: [],

  collectPots: null,

  seedName: '',
  savedSeeds: loadSavedSeeds(),

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
      collectPots: reconcileCollect(config, null),
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
      cheats: { ...st.cheats, armedTriggers: [], forceMaxWin: false },
    });

    pendingRound = round;
    // queue every spin (base + feature spins) to animate one after another
    spinQueue = [...round.spins];
    accumulatedWin = 0;
    featureDone = 0;
    featureTotal = round.spins.filter((s) => s.kind !== 'normal').length;

    // no-animation fast path: settle straight to the final grid
    if (!st.animationEnabled) {
      const last = round.spins.at(-1);
      currentSpinFinalGrid = last?.gridSteps.at(-1) ?? last?.grid ?? finalGrid;
      finalizeRound();
      return;
    }

    playNextSpin(); // animate the base spin; feature spins follow on finish
  },

  // Called by the SlotCanvas when a spin's animation completes (or on
  // quick-stop). Settles that spin, then plays the next or ends the round.
  finishPresentation: () => {
    if (!pendingRound) return;

    // settle the spin that just finished; accumulate the running win display
    accumulatedWin += currentSpinWin;
    set((s) => ({
      presentation: null,
      displayGrid: currentSpinFinalGrid ?? s.displayGrid,
      roundWin: accumulatedWin,
    }));

    if (spinQueue.length > 0) {
      // short beat, then play the next (feature) spin
      const prof = get().speed === 'turbo' ? get().config.animation.turbo : get().config.animation.normal;
      const gap = Math.max(120, Math.min(700, (prof.stopInterval ?? 120) * 2));
      setTimeout(() => playNextSpin(), gap);
    } else {
      finalizeRound();
    }
  },

  stopSpin: () => {
    // quick-stop: skip remaining feature animations and settle the round
    if (!pendingRound) return;
    const last = pendingRound.spins.at(-1);
    currentSpinFinalGrid = last?.gridSteps.at(-1) ?? last?.grid ?? currentSpinFinalGrid;
    finalizeRound();
  },

  /* --------------------------- fake collect ------------------------- */
  // Advance the persistent pots by one upgrade roll each (called after a spin).
  advanceFakeCollect: (onComplete) => {
    const cfg = get().config.fakeCollect;
    const pots = get().collectPots;
    if (!cfg?.enabled || !pots || pots.length === 0) { onComplete?.(); return; }

    fcTimers.forEach((t) => clearTimeout(t));
    fcTimers = [];

    const next = pots.map((p) => ({ ...p, stage: rollStage(p.stage, cfg) }));
    set({ collectPots: next });
    // let the grow / pop animation play before continuing (e.g. auto-spin)
    fcTimers.push(window.setTimeout(() => onComplete?.(), 700));
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
    set({ spinning: true, roundWin: 0 });

    const round = engine.playRound(res.play);
    stats.record(round);
    liveStats.record(round);
    const snap = stats.snapshot();
    const base = round.spins[0];
    const finalGrid = base?.gridSteps.at(-1) ?? base?.grid ?? st.displayGrid;

    set((s) => ({
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

    // play the bought feature out spin-by-spin, just like a normal round
    pendingRound = round;
    spinQueue = [...round.spins];
    accumulatedWin = 0;
    featureDone = 0;
    featureTotal = round.spins.filter((s) => s.kind !== 'normal').length;

    if (!st.animationEnabled) {
      const last = round.spins.at(-1);
      currentSpinFinalGrid = last?.gridSteps.at(-1) ?? last?.grid ?? finalGrid;
      finalizeRound();
      return;
    }
    playNextSpin();
  },

  /* --------------------------- settings ----------------------------- */
  setBet: (bet) => set({ bet }),
  setSpeed: (speed) => set({ speed }),
  toggleAnimation: () => set((s) => ({ animationEnabled: !s.animationEnabled })),

  setSeedMode: (fixed, seed) => {
    set({ useFixedSeed: fixed, seed: seed ?? get().seed });
    get().init();
  },

  armTrigger: (id) =>
    set((s) => ({
      cheats: {
        ...s.cheats,
        armedTriggers: s.cheats.armedTriggers.includes(id)
          ? s.cheats.armedTriggers.filter((t) => t !== id)
          : [...s.cheats.armedTriggers, id],
      },
    })),

  armMaxWin: (on, x) =>
    set((s) => ({ cheats: { ...s.cheats, forceMaxWin: on, maxWinX: x ?? s.cheats.maxWinX } })),

  clearCheats: () => set((s) => ({ cheats: { ...s.cheats, armedTriggers: [], forceMaxWin: false } })),

  updateConfig: (mutator) => {
    const next = clone(get().config);
    mutator(next);
    set({ config: next });
    // rebuild engine session against new config (keeps seed mode)
    const { useFixedSeed, seed } = get();
    session = createSession(next, useFixedSeed ? seed : null);
    set((s) => ({
      displayGrid: emptyGrid(next.grid.shape, next.symbols.at(-1)?.id ?? 'LJ'),
      collectPots: reconcileCollect(next, s.collectPots),
    }));
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
    // hard cap to keep the browser from running out of memory
    const MAX_SIM = 10_000_000;
    rounds = Math.max(1, Math.min(MAX_SIM, Math.floor(rounds)));
    set({ simRunning: true, simProgress: 0, simReport: null, simRtpHistory: [] });
    const { config, useFixedSeed, seed, bet } = get();
    const series: RtpSample[] = [];
    const report = await runSimulation(config, {
      rounds,
      bet,
      seed: useFixedSeed ? seed : null,
      chunk: Math.max(1000, Math.floor(rounds / 100)),
      onProgress: (done, total, partial) => {
        series.push({ round: done, rtp: partial.actualRTP });
        set({
          simProgress: done / total,
          stats: partial,
          simRtpHistory: [...series],
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

  /* --------------------------- named seeds -------------------------- */
  setSeedName: (name) => set({ seedName: name }),
  saveSeed: () => {
    const { seed, seedName, savedSeeds } = get();
    const name = (seedName.trim() || `種子 ${seed}`).slice(0, 40);
    const list = [...savedSeeds.filter((s) => s.name !== name), { name, seed }];
    persistSeeds(list);
    set({ savedSeeds: list, seedName: name });
  },
  loadSeed: (seed, name) => {
    set({ seedName: name });
    get().setSeedMode(true, seed);
  },
  deleteSeed: (name) => {
    const list = get().savedSeeds.filter((s) => s.name !== name);
    persistSeeds(list);
    set({ savedSeeds: list });
  },
  };
});
