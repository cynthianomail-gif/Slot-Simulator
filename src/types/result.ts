import type { GridResult, CellPos } from './grid';

/** A single win line / way / cluster produced by the pay engine. */
export interface WinLine {
  /** 'payline' id, 'ways', or 'cluster'. */
  kind: 'payline' | 'ways' | 'cluster';
  symbolId: string;
  count: number;
  /** Base payout before line-level multiplier (in bet units * coin). */
  basePay: number;
  /** Multiplier contributed by participating wilds / feature state. */
  multiplier: number;
  /** Final pay = basePay * multiplier. */
  pay: number;
  /** Cells participating in this win (for highlight). */
  cells: CellPos[];
  /** Payline id when kind === 'payline'. */
  lineId?: number;
}

/** Result of evaluating a single grid (one spin or one cascade step). */
export interface EvalResult {
  wins: WinLine[];
  totalPay: number;
  /** Symbol id -> total count on the grid (used by triggers). */
  symbolCounts: Record<string, number>;
}

/** Output of one full spin (including all internal cascades). */
export interface SpinResult {
  spinId: number;
  kind: string;
  reelStops: number[];
  /** Grid as initially landed. */
  grid: GridResult;
  /**
   * Grid snapshot evaluated at each cascade step. gridSteps[i] aligns with
   * cascades[i]: gridSteps[0] is the landed board, gridSteps[i+1] is the board
   * after removing cascades[i] wins and refilling. Used for visual replay.
   */
  gridSteps: GridResult[];
  /** Per-cascade evaluation results, in order. */
  cascades: EvalResult[];
  /** Sum of all cascade pays in this spin. */
  spinWin: number;
  /** Triggers that fired this spin (trigger ids). */
  firedTriggers: string[];
}

/** Output of a full round (normal spin + any feature sessions). */
export interface RoundResult {
  roundId: number;
  bet: number;
  spins: SpinResult[];
  totalWin: number;
  /** Round RTP relative to its own wager (totalWin / bet). */
  roundReturn: number;
  triggeredFeatures: string[];
}
