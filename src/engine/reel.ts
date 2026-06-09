import type { GameConfig, GridResult } from '@/types';
import type { IRng } from './rng';

/**
 * Reel engine — produces the landed grid for a spin.
 *
 * Two math models:
 *  - 'weight'    : each visible cell is an independent weighted draw.
 *  - 'reelstrip' : each column picks a stop index on its strip, then reads
 *                  `rows` consecutive symbols (wrapping around the strip).
 *
 * The chosen stop indices are returned as `reelStops` for the debug panel and
 * for deterministic reproduction.
 */

export interface ReelOutcome {
  grid: GridResult;
  reelStops: number[];
}

/**
 * Symbols (and their weights) eligible to land on a given reel (0-indexed col).
 * Symbols whose `excludeReels` lists this reel (1-indexed) are dropped. Used by
 * both the weight math and the spinning visuals so the two always agree.
 */
export function reelSymbolWeights(
  config: GameConfig,
  col: number,
  useFg = false,
): { ids: string[]; weights: number[] } {
  const reelNo = col + 1; // excludeReels is authored 1-indexed
  const w = (s: GameConfig['symbols'][number]) =>
    Math.max(0, useFg ? s.fgWeight ?? s.weight : s.weight);
  const ids: string[] = [];
  const weights: number[] = [];
  for (const s of config.symbols) {
    if (s.excludeReels?.includes(reelNo)) continue;
    ids.push(s.id);
    weights.push(w(s));
  }
  // never leave a reel empty
  if (ids.length === 0) {
    for (const s of config.symbols) {
      ids.push(s.id);
      weights.push(w(s));
    }
  }
  return { ids, weights };
}

/**
 * Weights for the spinning blur visual on a reel. Defaults to the math weights,
 * but when a custom "假盤" (fake board) is enabled it uses those overrides
 * instead — still limited to the symbols that may appear on this reel.
 */
export function spinVisualWeights(
  config: GameConfig,
  col: number,
): { ids: string[]; weights: number[] } {
  const base = reelSymbolWeights(config, col);
  const fr = config.fakeReel;
  if (fr?.enabled && fr.weights[col]) {
    const weights = base.ids.map((id) => Math.max(0, fr.weights[col]?.[id] ?? 0));
    if (weights.some((w) => w > 0)) return { ids: base.ids, weights };
  }
  return base;
}

export function spinReels(config: GameConfig, rng: IRng, useFg = false): ReelOutcome {
  const shape = config.grid.shape;
  const cols = shape.length;
  const reelStops: number[] = new Array(cols).fill(0);
  const columns: string[][] = [];

  if (config.math.mode === 'reelstrip') {
    for (let col = 0; col < cols; col++) {
      const strip = config.reels.strips[col] ?? config.reels.strips[0] ?? [];
      const rows = shape[col];
      if (strip.length === 0) {
        columns.push(Array.from({ length: rows }, () => '?'));
        continue;
      }
      const stop = rng.int(strip.length);
      reelStops[col] = stop;
      const column: string[] = [];
      for (let r = 0; r < rows; r++) {
        column.push(strip[(stop + r) % strip.length]);
      }
      columns.push(column);
    }
  } else {
    // weight-based independent draws, per-reel (honours excludeReels + FG)
    for (let col = 0; col < cols; col++) {
      const rows = shape[col];
      const { ids, weights } = reelSymbolWeights(config, col, useFg);
      const column: string[] = [];
      for (let r = 0; r < rows; r++) {
        const idx = rng.weightedIndex(weights);
        column.push(ids[idx]);
      }
      columns.push(column);
      reelStops[col] = -1; // not applicable in weight mode
    }
  }

  return {
    grid: { cols, shape: [...shape], columns },
    reelStops,
  };
}

/**
 * Build a grid directly from explicit stop indices (used by cheats / replay /
 * fixed-outcome injection). Falls back to weight mode if no strips exist.
 */
export function gridFromStops(config: GameConfig, stops: number[]): ReelOutcome {
  const shape = config.grid.shape;
  const cols = shape.length;
  const columns: string[][] = [];
  for (let col = 0; col < cols; col++) {
    const strip = config.reels.strips[col] ?? config.reels.strips[0] ?? [];
    const rows = shape[col];
    const stop = stops[col] ?? 0;
    const column: string[] = [];
    for (let r = 0; r < rows; r++) {
      column.push(strip.length ? strip[(stop + r) % strip.length] : '?');
    }
    columns.push(column);
  }
  return { grid: { cols, shape: [...shape], columns }, reelStops: [...stops] };
}
