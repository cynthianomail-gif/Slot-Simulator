import type { SymbolDefinition, WildConfig } from './symbol';
import type { GridShape } from './grid';

/** Math model used to generate reel outcomes. */
export type MathMode = 'weight' | 'reelstrip';

/** Per-mode math target (hit rate + average win multiplier). */
export interface MathTarget {
  /** Mode label: 'NG' (normal game), 'FG' (free game), 'BG' (bonus), or custom. */
  mode: string;
  /** Target hit rate (winning spins / total spins), 0‥1. */
  hitRate: number;
  /** Target average win expressed as a multiple of bet (winning spins only). */
  avgWinX: number;
}

/** Pay evaluation model. */
export type PayMode = 'payline' | 'ways' | 'cluster';

/** Reel spin presentation style. */
export type AnimationType = 'rolling' | 'independent' | 'cascading' | 'flipping';

/** A single payline: row index per column. -1 = column not part of the line. */
export interface PaylineDef {
  id: number;
  rows: number[];
}

/* ----------------------------- Trigger model ----------------------------- */

export type Comparator = '>=' | '>' | '=' | '<' | '<=';
export type TriggerLogic = 'AND' | 'OR' | 'NOT';

/** A leaf condition evaluated against an evaluation context. */
export interface TriggerCondition {
  /** Count symbols of this id across the grid. */
  symbolId?: string;
  /** A named metric from the evaluation context (e.g. 'totalMultiplier', 'win'). */
  metric?: string;
  comparator: Comparator;
  value: number;
}

/** A composable boolean tree of conditions. */
export interface TriggerNode {
  logic: TriggerLogic;
  conditions?: TriggerCondition[];
  children?: TriggerNode[];
}

/** Binds a boolean rule to a feature that should fire when the rule is satisfied. */
export interface TriggerDef {
  id: string;
  name: string;
  /** id of the feature plugin instance to activate. */
  target: string;
  rule: TriggerNode;
}

/* ----------------------------- Feature model ----------------------------- */

export interface FeatureConfigEntry {
  id: string;
  /** Plugin type key, resolved through the feature registry. */
  type: string;
  enabled: boolean;
  params: Record<string, unknown>;
}

/* ------------------------------ Buy feature ------------------------------ */

export interface BuyOption {
  id: string;
  name: string;
  /** Cost expressed as a multiple of current bet. */
  cost: number;
  /** Trigger / feature id to force when purchased. */
  forceTarget: string;
  payload?: Record<string, unknown>;
}

/* ------------------------------ Animation -------------------------------- */

export interface AnimationProfile {
  totalSpinTime: number;
  spinSpeed: number;
  stopInterval: number;
  bounceDuration: number;
  bounceCurve: string;
  /** Delay (ms) after a round settles before the next auto-spin starts. */
  roundGap?: number;
}

/* ------------------------------ Win Distribution ------------------------- */

export interface WinTier {
  label: string;
  /** 'NG' for normal game, 'FG' for all feature modes (FG, BG, etc.) */
  group: 'NG' | 'FG';
  /** Win multiplier range lower bound (inclusive). */
  min: number;
  /** Win multiplier range upper bound (inclusive), null = unbounded (e.g. 32+). */
  max: number | null;
  /** Target percentage of total rounds that fall into this tier. */
  percent: number;
}

/* ------------------------------ GameConfig ------------------------------- */

export interface GameConfig {
  meta: { name: string; version: string };

  user: { name: string; balance: number };

  bet: { default: number; steps: number[] };

  math: {
    mode: MathMode;
    /** Target return-to-player, 0..1 (informational / validation target). */
    targetRTP: number;
    /** Target bonus frequency expressed as "1 in N". */
    targetBF: number;
    /** Per-mode targets: hit rate & average win multiplier. */
    targets: MathTarget[];
    /** Win distribution tiers (8 tiers, percentages should sum to 100). */
    winDistribution?: WinTier[];
  };

  grid: {
    cols: number;
    shape: GridShape;
  };

  pay: {
    mode: PayMode;
    /** Minimum matching symbols required to pay (payline/ways: 3, cluster: e.g. 8). */
    minMatch: number;
    /**
     * Maximum matching tier in the payout table.
     * Determines how many payout columns each symbol has:
     *   payout.length = maxMatch - minMatch + 1
     * If omitted, derived from the longest existing payout array.
     */
    maxMatch?: number;
    /**
     * Cluster-mode payout ranges. Each entry is [min, max] inclusive.
     * e.g. [[5,5],[6,7],[8,9],[10,12],[13,14],[15,19],[20,24],[25,29],[30,34],[35,40],[41,44],[45,48],[49,49]]
     * symbol.payout[k] maps to payRanges[k].
     * When omitted, falls back to one-per-count (minMatch..maxMatch).
     */
    payRanges?: [number, number][];
    paylines?: PaylineDef[];
    /** Cluster minimum override (falls back to minMatch). */
    clusterMin?: number;
  };

  /**
   * 連爆 — cascade / chain mechanic. When enabled a winning spin removes symbols
   * and refills, repeating until no win. Independent of the animation style
   * (which only decides how the refill is presented).
   */
  cascade?: {
    enabled: boolean;
    /** Show the win of each cascade step as it happens. */
    showStepWin: boolean;
    /**
     * Refill rule:
     *  - 'fillDown'   : remove winning cells, collapse down, fill from the top.
     *  - 'clearMatch' : also remove every cell sharing a winning symbol id.
     *  - 'respin'     : refill the cleared cells in place (no gravity).
     */
    refill: 'fillDown' | 'clearMatch' | 'respin';
  };

  symbols: SymbolDefinition[];

  wild?: WildConfig;

  reels: {
    /** strips[col] = ordered list of symbol ids on that reel. */
    strips: string[][];
  };

  /**
   * "假盤" — spin-visual weight overrides, decoupled from the math weights.
   * When enabled, the spinning blur samples these instead of symbol weights.
   */
  fakeReel?: {
    enabled: boolean;
    /** weights[col][symbolId] — relative weights used ONLY for the spin blur. */
    weights: Record<number, Record<string, number>>;
  };

  /**
   * "假收集" — pots placed on the board plus a stage-upgrade model.
   * Configuration only (the live pot animation consumes it separately).
   */
  fakeCollect?: {
    enabled: boolean;
    /** Number of pots placed on the board. */
    count: number;
    /** Number of collection stages. */
    stages: number;
    /**
     * Per current stage (index 0 = stage 1) the upgrade chances, in %.
     * up[k] = chance to jump (k+1) stages; stay = chance to remain.
     * Each row should sum to 100.
     */
    upgrade: { up: number[]; stay: number }[];
  };

  triggers: TriggerDef[];

  features: FeatureConfigEntry[];

  buyOptions: BuyOption[];

  animation: {
    type: AnimationType;
    normal: AnimationProfile;
    turbo: AnimationProfile;
  };

  paytableInfo: { format: 'text' | 'markdown'; content: string };
}
