import type {
  GameConfig,
  SpinResult,
  EvalResult,
  WinTier,
  FeatureConfigEntry,
  TriggerNode,
} from '@/types';
import type { IRng } from './rng';
import { runNaturalSpin } from './spinRunner';
import { spinReels } from './reel';
import { evalTriggers, evalTriggerNode } from './trigger';
import { createFeature } from '@/features/registry';
import type { FeatureRunContext } from '@/features/types';
import { kindToModeLabel } from './statistics';

/**
 * Card-pool engine — true 二階段「產牌 → 取牌」 model.
 *
 * 產牌 (Generation): at construction time a library of natural boards is
 * generated from the configured reels — one pool of single spins for NG and
 * one pool of complete feature sessions (free game / bonus / custom) per
 * reachable feature. Every entry is a *real* board sequence with its natural
 * win, bucketed into the configured win tiers (占比區間).
 *
 * 取牌 (Selection): each round first rolls the user-set 得分率 (hit rate),
 * then picks a tier by 占比, then performs the 倍數挑戰 (multiplier
 * challenge): with probability `challengeQ` the player keeps the drawn
 * multiplier (a real board from that bucket is shown and paid its natural
 * win); otherwise the result collapses to the 保底 floor (or zero).
 *
 * RTP 主體: `challengeQ` is solved analytically from the pool statistics so
 * that E[payout] = targetRTP × bet — the tiers, hit rates and floors shape
 * the feel, the challenge rate locks the return.
 */

const NG_POOL_SIZE = 3000;
/** Cheap extra sample (grids only, no pay eval) for trigger-rate precision. */
const TRIGGER_SAMPLE_SIZE = 30_000;
const SESSION_POOL_SIZE = 240;
const SESSION_SPIN_BUDGET = 30_000; // total spins allowed per feature pool
const MAX_WIN_X = 12_000;

/* ------------------------------- pool data ------------------------------- */

interface PoolBoard {
  winX: number; // natural win in ×bet units
  trigKey: string; // sorted fired-trigger ids joined by '+', '' = none
  spin: SpinResult; // generated at bet = 1
}

interface PoolSession {
  totalX: number; // natural session total in ×bet units
  spins: SpinResult[]; // generated at bet = 1
}

interface NgTierBucket {
  tier: WinTier;
  effLo: number;
  effHi: number; // synthetic-draw upper bound (cap for unbounded tiers)
  weight: number; // normalized share within the NG group
  mean: number; // E[pay | tier drawn]
  boards: Map<string, PoolBoard[]>; // trigKey -> boards
  count: number;
  synthetic: boolean;
}

interface SessionTierBucket {
  tier: WinTier;
  effLo: number;
  effHi: number;
  weight: number;
  mean: number;
  sessions: PoolSession[];
  synthetic: boolean;
}

interface FeaturePool {
  entry: FeatureConfigEntry;
  mode: string; // stats/floor mode label ('FG', 'BG', custom)
  floor: number; // 保底 session total
  triggerRate: number; // natural per-round trigger probability
  all: PoolSession[]; // sorted by totalX ascending
  zeroSpins: SpinResult[]; // individual zero-win spins of this kind
  tiers: SessionTierBucket[];
  meanDrawn: number; // Σ weight × mean
  spinHitRate: number; // natural per-spin hit rate inside pooled sessions
}

/* ------------------------------- pool info ------------------------------- */

export interface PoolTierStat {
  label: string;
  group: string;
  effLo: number;
  effHi: number;
  weight: number;
  mean: number;
  count: number;
  synthetic: boolean;
}

export interface PoolFeatureInfo {
  entryId: string;
  mode: string;
  triggerRate: number;
  floor: number;
  sessionCount: number;
  /** 牌庫場內每局的自然得分率。 */
  spinHitRate: number;
  tiers: PoolTierStat[];
}

export interface PoolInfo {
  ngPoolSize: number;
  naturalHitRate: number;
  /** 設定的 NG 得分率（取牌嘗試率）。 */
  hitRateNG: number;
  floorNG: number;
  /** 倍數挑戰勝率（由 RTP 反解）。 */
  challengeQ: number;
  /** 殘餘全域加成（1 = 無；≠1 表示占比設定無法達到目標 RTP）。 */
  boost: number;
  /** 解析期望 RTP（應 = targetRTP）。 */
  expectedRTP: number;
  /** 解析上的實際 NG 得分率 ≈ 設定得分率 × 挑戰勝率。 */
  observedHitRateNG: number;
  triggerRates: Record<string, number>;
  ngTiers: PoolTierStat[];
  features: PoolFeatureInfo[];
  notes: string[];
}

/* --------------------------------- utils --------------------------------- */

function trigKeyOf(ids: string[]): string {
  return [...ids].sort().join('+');
}

function unboundedCap(lo: number): number {
  return Math.min(MAX_WIN_X, Math.max(lo * 2, lo + 50));
}

function pickIndexByWeight(weights: number[], rng: IRng): number {
  let total = 0;
  for (const w of weights) total += w;
  if (total <= 0) return -1;
  let r = rng.next() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return weights.length - 1;
}

function pickOne<T>(arr: T[], rng: IRng): T {
  return arr[Math.min(arr.length - 1, Math.floor(rng.next() * arr.length))];
}

/** Shallow wrapper so callers never mutate shared pool objects. */
function wrapSpin(spin: SpinResult): SpinResult {
  return { ...spin, firedTriggers: [] };
}

/** Wrapper with every win amount scaled by `f` (boards stay identical). */
function scaleSpin(spin: SpinResult, f: number): SpinResult {
  return {
    ...spin,
    firedTriggers: [],
    spinWin: spin.spinWin * f,
    cascades: spin.cascades.map((c) => ({
      ...c,
      totalPay: c.totalPay * f,
      wins: c.wins.map((w) => ({ ...w, basePay: w.basePay * f, pay: w.pay * f })),
    })),
  };
}

/** Wrapper that shows only the final board with no win lines (true zero). */
function stripSpin(spin: SpinResult): SpinResult {
  const finalGrid = spin.gridSteps.at(-1) ?? spin.grid;
  const counts = spin.cascades.at(-1)?.symbolCounts ?? {};
  const empty: EvalResult = { wins: [], totalPay: 0, symbolCounts: counts };
  return {
    ...spin,
    firedTriggers: [],
    spinWin: 0,
    gridSteps: [finalGrid],
    cascades: [empty],
  };
}

/* -------------------------------- CardPool -------------------------------- */

export class CardPool {
  readonly info: PoolInfo;

  private hitRateNG: number;
  private floorNG: number;
  private challengeQ = 1;
  private boostFactor = 1;

  private ngTiers: NgTierBucket[] = [];
  private ngZero = new Map<string, PoolBoard[]>(); // trigKey -> zero-win boards
  private ngByTrig = new Map<string, PoolBoard[]>(); // trigKey -> all, sorted by winX
  private featurePools = new Map<string, FeaturePool>();
  private triggerRates = new Map<string, number>();

  constructor(private config: GameConfig, rng: IRng) {
    const notes: string[] = [];
    const dist = config.math.winDistribution ?? [];
    const targets = config.math.targets ?? [];
    const targetOf = (mode: string) => targets.find((t) => t.mode === mode);

    // 各組占比應剛好合計 100（取牌仍按相對權重運作，但設定面要求 100）
    for (const group of ['NG', 'FG'] as const) {
      const total = dist.filter((t) => t.group === group).reduce((s, t) => s + t.percent, 0);
      if (total > 0 && Math.abs(total - 100) >= 0.05) {
        notes.push(`${group} 占比合計 ${total.toFixed(1)}% ≠ 100% — 請調整為剛好 100`);
      }
    }

    /* ---------------- 產牌 phase 1: NG single-spin pool ---------------- */

    const boards: PoolBoard[] = [];
    let winning = 0;
    const trigCount = new Map<string, number>();
    for (const t of config.triggers) trigCount.set(t.id, 0);

    for (let i = 0; i < NG_POOL_SIZE; i++) {
      const spin = runNaturalSpin(config, rng, 'normal', 1);
      const ctx = this.triggerCtx(spin);
      const fired = evalTriggers(config.triggers, ctx).map((t) => t.id);
      for (const id of fired) trigCount.set(id, (trigCount.get(id) ?? 0) + 1);
      const board: PoolBoard = { winX: spin.spinWin, trigKey: trigKeyOf(fired), spin };
      boards.push(board);
      if (board.winX > 0) winning++;

      const byTrig = this.ngByTrig.get(board.trigKey) ?? [];
      if (byTrig.length === 0) this.ngByTrig.set(board.trigKey, byTrig);
      byTrig.push(board);
      if (board.winX <= 0) {
        const z = this.ngZero.get(board.trigKey) ?? [];
        if (z.length === 0) this.ngZero.set(board.trigKey, z);
        z.push(board);
      }
    }
    for (const list of this.ngByTrig.values()) list.sort((a, b) => a.winX - b.winX);
    const naturalHitRate = winning / NG_POOL_SIZE;
    for (const [id, n] of trigCount) this.triggerRates.set(id, n / NG_POOL_SIZE);

    // Refine symbol-only trigger rates with a much larger, cheap grid sample
    // (the 3000-board estimate has too much sampling error for rare triggers).
    this.refineTriggerRates(rng);

    /* ----------------- NG tier buckets (占比 → 牌庫桶) ----------------- */

    const ngTarget = targetOf('NG');
    this.hitRateNG = clamp01(ngTarget?.hitRate ?? naturalHitRate);
    this.floorNG = Math.max(0, ngTarget?.minWinX ?? 0);

    const ngDist = dist.filter((t) => t.group === 'NG');
    this.ngTiers = this.buildNgTiers(ngDist, boards, notes);
    if (ngDist.length === 0) notes.push('未設定 NG 占比區間 — NG 永遠不得分');

    /* --------------- 產牌 phase 2: feature session pools --------------- */

    const fgDist = dist.filter((t) => t.group === 'FG');
    const reachable = this.reachableFeatures();
    for (const entry of reachable) {
      const fp = this.buildFeaturePool(entry, fgDist, rng, targetOf, notes);
      if (fp) this.featurePools.set(entry.id, fp);
    }

    /* ------------- RTP lock: solve the challenge win rate ------------- */
    //   X = all-success expected RTP, Y = all-fail expected RTP (floors)
    //   q = (targetRTP − Y) / (X − Y)

    const meanNG = this.ngTiers.reduce((s, t) => s + t.weight * t.mean, 0);
    let X = this.hitRateNG * meanNG;
    let Y = 0; // NG challenge failure pays 0 (zero board)
    for (const fp of this.featurePools.values()) {
      X += fp.triggerRate * fp.meanDrawn;
      Y += fp.triggerRate * fp.floor;
    }

    const targetRTP = config.math.targetRTP;
    if (X - Y > 1e-9) {
      const qRaw = (targetRTP - Y) / (X - Y);
      if (qRaw > 1) {
        this.challengeQ = 1;
        this.boostFactor = X > 0 ? targetRTP / X : 1;
        notes.push(
          `占比設定的期望值 (${X.toFixed(3)}) 低於目標 RTP — 全域加成 ×${this.boostFactor.toFixed(3)}`,
        );
      } else if (qRaw < 0) {
        this.challengeQ = 0;
        this.boostFactor = Y > 0 ? targetRTP / Y : 1;
        notes.push(
          `保底總期望 (${Y.toFixed(3)}) 已超過目標 RTP — 保底被縮放 ×${this.boostFactor.toFixed(3)}`,
        );
      } else {
        this.challengeQ = qRaw;
      }
    } else {
      this.challengeQ = 1;
      this.boostFactor = X > 0 ? targetRTP / X : 1;
      notes.push('占比/得分率設定退化，無法解出挑戰勝率');
    }

    const expectedRTP =
      this.boostFactor * (this.challengeQ * X + (1 - this.challengeQ) * Y);

    this.info = {
      ngPoolSize: NG_POOL_SIZE,
      naturalHitRate,
      hitRateNG: this.hitRateNG,
      floorNG: this.floorNG,
      challengeQ: this.challengeQ,
      boost: this.boostFactor,
      expectedRTP,
      observedHitRateNG:
        this.hitRateNG * (this.challengeQ + (1 - this.challengeQ) * (this.floorNG > 0 ? 1 : 0)),
      triggerRates: Object.fromEntries(this.triggerRates),
      ngTiers: this.ngTiers.map((t) => tierStat(t.tier, t)),
      features: [...this.featurePools.values()].map((fp) => ({
        entryId: fp.entry.id,
        mode: fp.mode,
        triggerRate: fp.triggerRate,
        floor: fp.floor,
        sessionCount: fp.all.length,
        spinHitRate: fp.spinHitRate,
        tiers: fp.tiers.map((t) => tierStat(t.tier, t)),
      })),
      notes,
    };
  }

  get boost(): number {
    return this.boostFactor;
  }

  /* ------------------------------ 取牌 API ------------------------------ */

  /** Roll each trigger independently at its pool-measured natural rate. */
  drawTriggers(rng: IRng): string[] {
    const fired: string[] = [];
    for (const [id, rate] of this.triggerRates) {
      if (rate > 0 && rng.next() < rate) fired.push(id);
    }
    return fired;
  }

  /**
   * 取牌 for the base spin: hit roll → tier by 占比 → 倍數挑戰.
   * Returns a bet-1 spin wrapper; `winX` is the amount actually paid (×bet).
   */
  drawBase(rng: IRng, trigKey: string): { spin: SpinResult; winX: number } {
    if (rng.next() >= this.hitRateNG) return this.zeroBoard(trigKey, rng);

    const idx = pickIndexByWeight(this.ngTiers.map((t) => t.weight), rng);
    if (idx < 0) return this.zeroBoard(trigKey, rng);
    const tier = this.ngTiers[idx];

    // 倍數挑戰 — 抽到的是「賭該倍數的權利」
    if (rng.next() >= this.challengeQ) {
      if (this.floorNG > 0) return this.boardAt(this.floorNG, trigKey);
      return this.zeroBoard(trigKey, rng);
    }

    const bucket = tier.boards.get(trigKey);
    if (bucket && bucket.length > 0) {
      const board = pickOne(bucket, rng);
      return { spin: wrapSpin(board.spin), winX: board.winX };
    }
    // bucket empty for this trigger combination → nearest natural board scaled
    const target = tier.effLo + rng.next() * (tier.effHi - tier.effLo);
    return this.boardAt(target, trigKey);
  }

  /**
   * 取牌 for one feature session: tier by 占比 → 倍數挑戰 → 保底.
   * Returns bet-1 spin wrappers; `totalX` is the session total paid (×bet).
   * Returns null when this feature has no pool (caller should run it live).
   */
  drawSession(
    entryId: string,
    rng: IRng,
  ): { spins: SpinResult[]; totalX: number } | null {
    const fp = this.featurePools.get(entryId);
    if (!fp || fp.all.length === 0 || fp.tiers.length === 0) return null;

    const idx = pickIndexByWeight(fp.tiers.map((t) => t.weight), rng);
    if (idx < 0) return null;
    const tier = fp.tiers[idx];

    if (rng.next() >= this.challengeQ) {
      // 挑戰失敗 → 保底（floor = 0 時為 0 分場）
      if (fp.floor > 0) return this.sessionAt(fp, fp.floor, rng);
      return this.zeroSession(fp, rng);
    }

    const bucket = tier.sessions;
    if (bucket.length > 0) {
      const s = pickOne(bucket, rng);
      return { spins: s.spins.map(wrapSpin), totalX: s.totalX };
    }
    // empty bucket → synthesize: nearest natural session scaled to a draw
    const target = tier.effLo + rng.next() * (tier.effHi - tier.effLo);
    return this.sessionAt(fp, target, rng);
  }

  /* ----------------------------- selection helpers ----------------------------- */

  private zeroBoard(trigKey: string, rng: IRng): { spin: SpinResult; winX: number } {
    const zero = this.ngZero.get(trigKey);
    if (zero && zero.length > 0) {
      return { spin: wrapSpin(pickOne(zero, rng).spin), winX: 0 };
    }
    // no natural zero board with this trigger combo → strip a winning one
    const any = this.ngByTrig.get(trigKey) ?? this.ngByTrig.get('') ?? [];
    if (any.length > 0) return { spin: stripSpin(any[0].spin), winX: 0 };
    // pool is empty (degenerate config) — synthesize an empty spin upstream
    throw new Error('CardPool: empty NG pool');
  }

  /** Nearest natural board (matching trigKey) scaled to pay exactly `target`. */
  private boardAt(target: number, trigKey: string): { spin: SpinResult; winX: number } {
    const list =
      withWins(this.ngByTrig.get(trigKey)) ?? withWins(this.ngByTrig.get('')) ?? null;
    if (!list || list.length === 0) throw new Error('CardPool: empty NG pool');
    const board = nearestBy(list, target, (b) => b.winX);
    if (Math.abs(board.winX - target) < 1e-9) {
      return { spin: wrapSpin(board.spin), winX: board.winX };
    }
    return { spin: scaleSpin(board.spin, target / board.winX), winX: target };
  }

  /** Nearest natural session scaled so its total pays exactly `target`. */
  private sessionAt(
    fp: FeaturePool,
    target: number,
    rng: IRng,
  ): { spins: SpinResult[]; totalX: number } {
    const winningSessions = fp.all.filter((s) => s.totalX > 0);
    if (winningSessions.length === 0) return this.zeroSession(fp, rng);
    const s = nearestBy(winningSessions, target, (x) => x.totalX);
    const f = target / s.totalX;
    return { spins: s.spins.map((sp) => scaleSpin(sp, f)), totalX: target };
  }

  /** A session of natural zero-win spins (true 0-pay feature run). */
  private zeroSession(fp: FeaturePool, rng: IRng): { spins: SpinResult[]; totalX: number } {
    const length = pickOne(fp.all, rng).spins.length;
    if (fp.zeroSpins.length > 0) {
      const spins = Array.from({ length }, () => wrapSpin(pickOne(fp.zeroSpins, rng)));
      return { spins, totalX: 0 };
    }
    // every natural spin of this kind wins → strip the smallest session
    const s = fp.all[0];
    return { spins: s.spins.map(stripSpin), totalX: 0 };
  }

  /* ------------------------------ build helpers ------------------------------ */

  /**
   * Estimate trigger rates from TRIGGER_SAMPLE_SIZE bare grids (no pay
   * evaluation — fast). Triggers whose rules reference win metrics keep the
   * full-evaluation estimate from the board pool.
   */
  private refineTriggerRates(rng: IRng): void {
    const symbolTriggers = this.config.triggers.filter((t) => !usesMetrics(t.rule));
    if (symbolTriggers.length === 0) return;

    const counts = new Map<string, number>(symbolTriggers.map((t) => [t.id, 0]));
    const ctx = { symbolCounts: {} as Record<string, number>, metrics: {} };
    for (let i = 0; i < TRIGGER_SAMPLE_SIZE; i++) {
      const { grid } = spinReels(this.config, rng, 'NG');
      const symbolCounts: Record<string, number> = {};
      for (const column of grid.columns) {
        for (const id of column) symbolCounts[id] = (symbolCounts[id] ?? 0) + 1;
      }
      ctx.symbolCounts = symbolCounts;
      for (const t of symbolTriggers) {
        if (evalTriggerNode(t.rule, ctx)) counts.set(t.id, (counts.get(t.id) ?? 0) + 1);
      }
    }
    for (const [id, n] of counts) this.triggerRates.set(id, n / TRIGGER_SAMPLE_SIZE);
  }

  private triggerCtx(spin: SpinResult) {
    const symbolCounts: Record<string, number> = {};
    for (const column of spin.grid.columns) {
      for (const id of column) symbolCounts[id] = (symbolCounts[id] ?? 0) + 1;
    }
    return { symbolCounts, metrics: { win: spin.spinWin, winX: spin.spinWin } };
  }

  private buildNgTiers(
    ngDist: WinTier[],
    boards: PoolBoard[],
    notes: string[],
  ): NgTierBucket[] {
    const floor = this.floorNG;
    const out: NgTierBucket[] = [];
    let totalPct = 0;

    for (const tier of ngDist) {
      const hi = tier.max ?? Infinity;
      if (hi <= floor || tier.percent <= 0) continue; // entirely below 保底
      const effLo = Math.max(tier.min, floor, 1e-6);
      const effHi = tier.max ?? unboundedCap(tier.min);
      const inTier = boards.filter((b) => b.winX >= effLo && b.winX < hi);

      const byKey = new Map<string, PoolBoard[]>();
      for (const b of inTier) {
        const list = byKey.get(b.trigKey) ?? [];
        if (list.length === 0) byKey.set(b.trigKey, list);
        list.push(b);
      }

      // The analytic mean must match what selection actually draws: ~99% of
      // rounds have no trigger, so they sample the trigKey='' sub-bucket.
      // When that sub-bucket is empty, selection falls back to a uniform
      // tier draw on a scaled board — use the uniform mean accordingly.
      const main = byKey.get('') ?? [];
      const synthetic = main.length === 0;
      const mean = synthetic
        ? Math.min(MAX_WIN_X, (effLo + effHi) / 2)
        : main.reduce((s, b) => s + b.winX, 0) / main.length;
      if (synthetic) {
        notes.push(`NG 區間「${tier.label}」牌庫無自然盤 — 以縮放盤合成`);
      }

      totalPct += tier.percent;
      out.push({ tier, effLo, effHi, weight: tier.percent, mean, boards: byKey, count: main.length, synthetic });
    }

    if (totalPct > 0) for (const t of out) t.weight /= totalPct;
    return out;
  }

  /** Feature entries reachable from triggers or buy options. */
  private reachableFeatures(): FeatureConfigEntry[] {
    const ids = new Set<string>();
    for (const t of this.config.triggers) ids.add(t.target);
    for (const b of this.config.buyOptions) {
      const trig = this.config.triggers.find((t) => t.id === b.forceTarget);
      ids.add(trig?.target ?? b.forceTarget);
    }
    return this.config.features.filter((f) => f.enabled && ids.has(f.id));
  }

  private buildFeaturePool(
    entry: FeatureConfigEntry,
    fgDist: WinTier[],
    rng: IRng,
    targetOf: (mode: string) => { minWinX?: number } | undefined,
    notes: string[],
  ): FeaturePool | null {
    const plugin = createFeature(entry.type);
    if (!plugin) return null;

    const kind = (entry.params.kind as string) ?? 'freegame';
    const mode = kindToModeLabel(kind);
    const floor = Math.max(0, targetOf(mode)?.minWinX ?? 0);

    // natural trigger rate = sum of rates of triggers targeting this entry
    let triggerRate = 0;
    for (const t of this.config.triggers) {
      if (t.target === entry.id) triggerRate += this.triggerRates.get(t.id) ?? 0;
    }

    const sessions: PoolSession[] = [];
    const zeroSpins: SpinResult[] = [];
    let spinBudget = SESSION_SPIN_BUDGET;
    let spinTotal = 0;
    let spinWinning = 0;

    for (let i = 0; i < SESSION_POOL_SIZE && spinBudget > 0; i++) {
      let used = 0;
      const ctx: FeatureRunContext = {
        config: this.config,
        rng,
        bet: 1,
        runSpin: (k: string) => {
          used++;
          spinTotal++;
          const spin = runNaturalSpin(this.config, rng, k, 1);
          if (spin.spinWin > 0) spinWinning++;
          else if (zeroSpins.length < 200) zeroSpins.push(spin);
          return spin;
        },
        emit: () => {},
      };
      const res = createFeature(entry.type)!.run(entry, ctx);
      spinBudget -= used;
      if (res.spins.length > 0) sessions.push({ totalX: res.win, spins: res.spins });
    }
    if (sessions.length === 0) return null;
    sessions.sort((a, b) => a.totalX - b.totalX);

    /* session tier buckets */
    const tiers: SessionTierBucket[] = [];
    let totalPct = 0;
    for (const tier of fgDist) {
      const hi = tier.max ?? Infinity;
      if (hi <= floor || tier.percent <= 0) continue;
      const effLo = Math.max(tier.min, floor, 1e-6);
      const effHi = tier.max ?? unboundedCap(tier.min);
      const inTier = sessions.filter((s) => s.totalX >= effLo && s.totalX < hi);
      const synthetic = inTier.length === 0;
      const mean = synthetic
        ? Math.min(MAX_WIN_X, (effLo + effHi) / 2)
        : inTier.reduce((s, x) => s + x.totalX, 0) / inTier.length;
      totalPct += tier.percent;
      tiers.push({ tier, effLo, effHi, weight: tier.percent, mean, sessions: inTier, synthetic });
    }
    if (totalPct > 0) for (const t of tiers) t.weight /= totalPct;
    if (tiers.length === 0) notes.push(`${entry.id}（${mode}）沒有可用的 FG 占比區間`);

    const meanDrawn = tiers.reduce((s, t) => s + t.weight * t.mean, 0);

    return {
      entry,
      mode,
      floor,
      triggerRate,
      all: sessions,
      zeroSpins,
      tiers,
      meanDrawn,
      spinHitRate: spinTotal > 0 ? spinWinning / spinTotal : 0,
    };
  }
}

/* --------------------------------- helpers --------------------------------- */

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function usesMetrics(node: TriggerNode): boolean {
  if (node.conditions?.some((c) => c.metric !== undefined)) return true;
  return node.children?.some((ch) => usesMetrics(ch)) ?? false;
}

function withWins(list: PoolBoard[] | undefined): PoolBoard[] | null {
  if (!list) return null;
  const w = list.filter((b) => b.winX > 0);
  return w.length > 0 ? w : null;
}

function nearestBy<T>(sorted: T[], target: number, key: (t: T) => number): T {
  // sorted ascending by key; binary search for the closest element
  let lo = 0;
  let hi = sorted.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (key(sorted[mid]) < target) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && Math.abs(key(sorted[lo - 1]) - target) < Math.abs(key(sorted[lo]) - target)) {
    return sorted[lo - 1];
  }
  return sorted[lo];
}

function tierStat(
  tier: WinTier,
  b: { effLo: number; effHi: number; weight: number; mean: number; synthetic: boolean; boards?: Map<string, PoolBoard[]>; count?: number; sessions?: PoolSession[] },
): PoolTierStat {
  return {
    label: tier.label,
    group: tier.group,
    effLo: b.effLo,
    effHi: b.effHi,
    weight: b.weight,
    mean: b.mean,
    count: b.count ?? b.sessions?.length ?? 0,
    synthetic: b.synthetic,
  };
}
