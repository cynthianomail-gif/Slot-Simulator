import type { GameConfig, GridResult, SpinResult, EvalResult } from '@/types';
import type { IRng } from './rng';
import { spinReels, reelSymbolWeights } from './reel';
import { evaluate } from './pay';

/**
 * Standalone natural-spin runner — the pure math of one spin (reels +
 * cascade loop) with no logging, state machine, or presentation concerns.
 * Used by the GameEngine and by the card-pool generator (產牌) so both
 * always produce identical boards for the same RNG stream.
 */

const SAFE_CASCADE_CAP = 50;

export function kindToMathMode(kind: string): string {
  if (kind === 'normal') return 'NG';
  if (kind === 'freegame' || kind === 'free') return 'FG';
  return 'BG';
}

/**
 * Refill the grid after a win, per config.cascade.refill:
 *  - fillDown   : remove winning cells, collapse down, fill from the top.
 *  - clearMatch : also remove every cell sharing a winning symbol id.
 *  - respin     : refill the cleared cells in place (no gravity).
 */
export function cascadeRefillGrid(
  config: GameConfig,
  rng: IRng,
  grid: GridResult,
  res: EvalResult,
  mode: string,
): GridResult {
  const method = config.cascade?.refill ?? 'fillDown';
  const remove = new Set<string>();
  for (const w of res.wins) {
    for (const c of w.cells) remove.add(`${c.col}:${c.row}`);
  }
  if (method === 'clearMatch') {
    const winIds = new Set(res.wins.map((w) => w.symbolId));
    for (let col = 0; col < grid.columns.length; col++) {
      for (let row = 0; row < grid.columns[col].length; row++) {
        if (winIds.has(grid.columns[col][row])) remove.add(`${col}:${row}`);
      }
    }
  }

  const pick = (col: number): string => {
    const { ids, weights } = reelSymbolWeights(config, col, mode);
    return ids[rng.weightedIndex(weights)];
  };

  if (method === 'respin') {
    // refill the cleared cells where they are; nothing collapses
    const columns = grid.columns.map((column, col) =>
      column.map((id, row) => (remove.has(`${col}:${row}`) ? pick(col) : id)),
    );
    return { cols: grid.cols, shape: [...grid.shape], columns };
  }

  // fillDown / clearMatch: survivors fall, fresh symbols fill the top
  const columns = grid.columns.map((column, col) => {
    const survivors: string[] = [];
    for (let row = 0; row < column.length; row++) {
      if (!remove.has(`${col}:${row}`)) survivors.push(column[row]);
    }
    while (survivors.length < column.length) survivors.push(pick(col));
    return survivors;
  });

  return { cols: grid.cols, shape: [...grid.shape], columns };
}

/**
 * Run one full natural spin (landed board + cascade chain) and return the
 * SpinResult. `spinWin` is expressed in `bet`-scaled units like the engine
 * (pass bet=1 to get pure ×bet multiples).
 */
export function runNaturalSpin(
  config: GameConfig,
  rng: IRng,
  kind: string,
  bet: number,
): SpinResult {
  const mode = kindToMathMode(kind);
  const outcome = spinReels(config, rng, mode);

  let grid = outcome.grid;
  const cascades: EvalResult[] = [];
  const gridSteps: GridResult[] = [];
  let spinWinUnits = 0;
  const cascading = config.cascade?.enabled ?? false;

  for (let step = 0; step <= SAFE_CASCADE_CAP; step++) {
    gridSteps.push(grid);
    const res = evaluate(config, grid);
    cascades.push(res);
    spinWinUnits += res.totalPay;

    if (cascading && res.wins.length > 0 && step < SAFE_CASCADE_CAP) {
      grid = cascadeRefillGrid(config, rng, grid, res, mode);
    } else {
      break;
    }
  }

  return {
    spinId: 0,
    kind,
    reelStops: outcome.reelStops,
    grid: outcome.grid,
    gridSteps,
    cascades,
    spinWin: spinWinUnits * bet,
    firedTriggers: [],
  };
}
