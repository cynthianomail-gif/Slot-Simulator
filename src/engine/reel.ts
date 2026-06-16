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
  mode = 'NG',
  comboStep?: number,
): { ids: string[]; weights: number[] } {
  const reelNo = col + 1; // excludeReels is authored 1-indexed
  // Override layers, highest priority first:
  //  1. comboWeights[mode][step][col]   (連爆逐步權重, only during cascade refills)
  //  2. reelWeights[mode][col]          (每軸 × 每模式)
  //  3. modeWeights[mode] / symbol.weight
  // Each layer falls back to NG for a non-NG mode, then to the next layer.
  const cw = config.comboWeights;
  const cwCol = comboStep != null && cw
    ? cw[mode]?.[comboStep]?.[col] ?? (mode !== 'NG' ? cw['NG']?.[comboStep]?.[col] : undefined)
    : undefined;
  const rw = config.reelWeights;
  const rwCol = rw
    ? rw[mode]?.[col] ?? (mode !== 'NG' ? rw['NG']?.[col] : undefined)
    : undefined;
  const w = (s: GameConfig['symbols'][number]) => {
    if (cwCol && cwCol[s.id] != null) return Math.max(0, cwCol[s.id]);
    if (rwCol && rwCol[s.id] != null) return Math.max(0, rwCol[s.id]);
    return Math.max(0, (mode !== 'NG' && s.modeWeights?.[mode] != null) ? s.modeWeights[mode].weight : s.weight);
  };
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

/**
 * 圖示數量上限 — effective per-symbol board caps for a mode (min of all
 * applicable caps). A cap with no `modes`, or one listing 'ALL' / this mode,
 * applies. Returns an empty map when nothing is capped (the common case).
 */
export function effectiveCaps(config: GameConfig, mode: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const c of config.symbolCaps ?? []) {
    const applies = !c.modes || c.modes.length === 0 || c.modes.includes('ALL') || c.modes.includes(mode);
    if (!applies || !(c.max >= 0)) continue;
    const prev = out.get(c.symbolId);
    out.set(c.symbolId, prev == null ? c.max : Math.min(prev, c.max));
  }
  return out;
}

/**
 * Weighted draw that honours board caps: a symbol already at its cap is dropped
 * from this draw. If every eligible symbol is capped out, falls back to the
 * uncapped weighted draw so a reel is never empty. Mutates `placed`.
 */
export function drawCapped(
  rng: IRng,
  ids: string[],
  weights: number[],
  caps: Map<string, number>,
  placed: Record<string, number>,
): string {
  let id: string;
  if (caps.size > 0) {
    const w = weights.slice();
    let sum = 0;
    for (let i = 0; i < ids.length; i++) {
      const cap = caps.get(ids[i]);
      if (cap != null && (placed[ids[i]] ?? 0) >= cap) w[i] = 0;
      sum += w[i];
    }
    id = sum > 0 ? ids[rng.weightedIndex(w)] : ids[rng.weightedIndex(weights)];
  } else {
    id = ids[rng.weightedIndex(weights)];
  }
  placed[id] = (placed[id] ?? 0) + 1;
  return id;
}

export function spinReels(config: GameConfig, rng: IRng, mode = 'NG'): ReelOutcome {
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
    // weight-based independent draws, per-reel (honours excludeReels + FG).
    // Board-wide symbol caps are enforced as the board fills, left→right /
    // bottom→top, so trigger counts (scatter/wild) respect 圖示數量上限.
    const caps = effectiveCaps(config, mode);
    const placed: Record<string, number> = {};
    for (let col = 0; col < cols; col++) {
      const rows = shape[col];
      const { ids, weights } = reelSymbolWeights(config, col, mode);
      const column: string[] = [];
      for (let r = 0; r < rows; r++) {
        column.push(drawCapped(rng, ids, weights, caps, placed));
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
