/**
 * Symbol definition system.
 * Symbol types are NOT hard-coded into the engine — a symbol declares its
 * behavioural roles through the `type` array and optional `properties`.
 */

export type SymbolType =
  | 'normal'
  | 'wild'
  | 'scatter'
  | 'bonus'
  | 'collector'
  | 'multiplier'
  | 'transform'
  | 'mystery'
  | 'expanding'
  | 'sticky';

export interface SymbolDefinition {
  id: string;
  name: string;
  image?: string;

  /** Behavioural roles. A symbol may have several, e.g. ['wild','expanding']. */
  type: SymbolType[];

  /** Base weight used by weight-based math mode (= NG weight). */
  weight: number;

  /**
   * Per-mode weight overrides keyed by mode label (e.g. 'FG', 'BG').
   * Falls back to `weight` / `stackWeight` when a mode has no entry.
   */
  modeWeights?: Record<string, { weight: number; stackWeight?: number }>;

  /** Optional separate weight for stacked appearance. */
  stackWeight?: number;

  /**
   * Reels (1-indexed) this symbol must NOT appear on. Undefined = appears on
   * every reel. Applied by weight math and the spinning visuals alike.
   */
  excludeReels?: number[];

  /**
   * Pay multiplier table indexed by (matchCount - minMatch).
   * payout.length should equal (maxMatch - minMatch + 1).
   * e.g. for a payline game minMatch=3, maxMatch=5:
   *   payout[0] = multiplier for 3-of-a-kind
   *   payout[1] = multiplier for 4-of-a-kind
   *   payout[2] = multiplier for 5-of-a-kind
   * For cluster pay with minMatch=8, maxMatch=12:
   *   payout[0] = multiplier for 8 symbols, etc.
   */
  payout: number[];

  /** Arbitrary tags consumed by feature plugins (e.g. 'persistent', 'gold'). */
  properties?: string[];
}

/** Wild engine configuration, fully decoupled from symbol definitions. */
export interface WildConfig {
  /** Symbol ids this wild substitutes for. Use ['*'] to substitute all payable symbols. */
  substituteSymbols: string[];
  /** Win multiplier applied when this wild participates in a win. */
  multiplier?: number;
  /** Whether the wild expands to fill its whole reel. */
  expand?: boolean;
  /** Whether the wild sticks across cascades / respins. */
  sticky?: boolean;
}
