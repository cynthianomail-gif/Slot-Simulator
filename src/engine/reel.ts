import type { GameConfig, GridResult, SymbolDefinition } from '@/types';
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

function symbolWeightMap(symbols: SymbolDefinition[]): {
  ids: string[];
  weights: number[];
} {
  const ids: string[] = [];
  const weights: number[] = [];
  for (const s of symbols) {
    ids.push(s.id);
    weights.push(Math.max(0, s.weight));
  }
  return { ids, weights };
}

export function spinReels(config: GameConfig, rng: IRng): ReelOutcome {
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
    // weight-based independent draws
    const { ids, weights } = symbolWeightMap(config.symbols);
    for (let col = 0; col < cols; col++) {
      const rows = shape[col];
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
