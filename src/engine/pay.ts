import type {
  GameConfig,
  GridResult,
  EvalResult,
  WinLine,
  CellPos,
  SymbolDefinition,
} from '@/types';
import { countSymbols, orthNeighbours } from './grid';
import {
  isWild,
  isScatter,
  wildSubstitutes,
  wildMultiplier,
  symbolIndex,
} from './wild';

/**
 * Pay engine. Supports three pay models driven entirely by GameConfig:
 *   - payline : fixed / custom lines, left-to-right.
 *   - ways    : adjacent-reel "ways" (243/1024/Megaways).
 *   - cluster : flood-filled connected groups of >= clusterMin.
 *
 * Returns an EvalResult with itemised win lines, total pay, and symbol counts.
 * Pay values are expressed in "bet-line units": the caller multiplies by the
 * per-line bet / coin value.
 */

function payoutFor(
  sym: SymbolDefinition | undefined,
  count: number,
  minMatch: number,
): number {
  if (!sym) return 0;
  const idx = count - minMatch;
  if (idx < 0 || idx >= sym.payout.length) {
    if (idx >= sym.payout.length && sym.payout.length > 0) {
      return sym.payout[sym.payout.length - 1];
    }
    return 0;
  }
  return sym.payout[idx];
}

function payoutForRanges(
  sym: SymbolDefinition | undefined,
  count: number,
  ranges: [number, number][],
): number {
  if (!sym) return 0;
  for (let k = 0; k < ranges.length; k++) {
    if (count >= ranges[k][0] && count <= ranges[k][1]) {
      return sym.payout[k] ?? 0;
    }
  }
  if (ranges.length > 0 && count > ranges[ranges.length - 1][1] && sym.payout.length > 0) {
    return sym.payout[sym.payout.length - 1];
  }
  return 0;
}

/** The set of payable base symbols a wild line can resolve to. */
function isPayableBase(sym: SymbolDefinition | undefined): boolean {
  if (!sym) return false;
  if (isScatter(sym)) return false;
  if (isWild(sym)) return false;
  // must have a non-trivial paytable
  return sym.payout.some((p) => p > 0);
}

/* ------------------------------- Payline --------------------------------- */

function evalPaylines(config: GameConfig, grid: GridResult): WinLine[] {
  const idx = symbolIndex(config);
  const minMatch = config.pay.minMatch;
  const wildCfg = config.wild;
  const lines = config.pay.paylines ?? [];
  const wins: WinLine[] = [];

  for (const line of lines) {
    // Collect symbol id at each column for this line (skip -1 columns).
    // Payline rows are authored TOP-DOWN (0 = top row), but each grid column is
    // stored bottom-up (index 0 = bottom), so convert before indexing.
    const path: { col: number; row: number; id: string }[] = [];
    for (let col = 0; col < grid.cols; col++) {
      const userRow = line.rows[col];
      if (userRow === undefined || userRow < 0) continue;
      const height = grid.columns[col]?.length ?? 0;
      const row = height - 1 - userRow;
      const id = grid.columns[col]?.[row];
      if (id === undefined) break;
      path.push({ col, row, id });
    }
    if (path.length < minMatch) continue;

    // Determine the base symbol of the win, allowing leading wilds.
    let baseId: string | null = null;
    for (const p of path) {
      const sym = idx.get(p.id);
      if (isWild(sym)) continue;
      if (isPayableBase(sym)) {
        baseId = p.id;
        break;
      } else {
        break; // a non-wild, non-payable symbol stops the line
      }
    }
    if (!baseId) continue;

    // Count consecutive matches from the left (wild or base).
    let count = 0;
    let lineMult = 1;
    const cells: CellPos[] = [];
    for (const p of path) {
      const sym = idx.get(p.id);
      const matchesAsWild =
        isWild(sym) && wildSubstitutes(wildCfg, baseId);
      const matchesBase = p.id === baseId;
      if (matchesAsWild) {
        lineMult *= wildMultiplier(wildCfg);
        count++;
        cells.push({ col: p.col, row: p.row });
      } else if (matchesBase) {
        count++;
        cells.push({ col: p.col, row: p.row });
      } else {
        break;
      }
    }

    if (count >= minMatch) {
      const base = payoutFor(idx.get(baseId), count, minMatch);
      if (base > 0) {
        wins.push({
          kind: 'payline',
          symbolId: baseId,
          count,
          basePay: base,
          multiplier: lineMult,
          pay: base * lineMult,
          cells,
          lineId: line.id,
        });
      }
    }
  }
  return wins;
}

/* --------------------------------- Ways ---------------------------------- */

function evalWays(config: GameConfig, grid: GridResult): WinLine[] {
  const idx = symbolIndex(config);
  const minMatch = config.pay.minMatch;
  const wildCfg = config.wild;
  const wins: WinLine[] = [];

  for (const base of config.symbols) {
    if (!isPayableBase(base)) continue;
    const baseId = base.id;

    // For each column, gather rows that are base or substituting wild.
    const perColCells: CellPos[][] = [];
    let consecutiveCols = 0;
    let waysCount = 1;
    let lineMult = 1;
    const cells: CellPos[] = [];

    for (let col = 0; col < grid.cols; col++) {
      const column = grid.columns[col] ?? [];
      const matches: CellPos[] = [];
      let colHasWild = false;
      for (let row = 0; row < column.length; row++) {
        const sym = idx.get(column[row]);
        const asWild = isWild(sym) && wildSubstitutes(wildCfg, baseId);
        if (asWild) colHasWild = true;
        if (column[row] === baseId || asWild) {
          matches.push({ col, row });
        }
      }
      if (matches.length === 0) break;
      perColCells.push(matches);
      consecutiveCols++;
      waysCount *= matches.length;
      if (colHasWild) lineMult *= wildMultiplier(wildCfg);
      cells.push(...matches);
    }

    if (consecutiveCols >= minMatch) {
      const basePay = payoutFor(base, consecutiveCols, minMatch);
      if (basePay > 0) {
        wins.push({
          kind: 'ways',
          symbolId: baseId,
          count: consecutiveCols,
          basePay: basePay * waysCount,
          multiplier: lineMult,
          pay: basePay * waysCount * lineMult,
          cells,
        });
      }
    }
  }
  return wins;
}

/* -------------------------------- Cluster -------------------------------- */

function evalCluster(config: GameConfig, grid: GridResult): WinLine[] {
  const idx = symbolIndex(config);
  const ranges = config.pay.payRanges;
  const minCluster = ranges ? ranges[0][0] : (config.pay.clusterMin ?? config.pay.minMatch);
  const wildCfg = config.wild;
  const wins: WinLine[] = [];

  const visited = new Set<string>();
  const key = (c: CellPos) => `${c.col}:${c.row}`;

  for (let col = 0; col < grid.cols; col++) {
    const column = grid.columns[col] ?? [];
    for (let row = 0; row < column.length; row++) {
      const startId = column[row];
      const startSym = idx.get(startId);
      if (!isPayableBase(startSym)) continue;
      const start: CellPos = { col, row };
      if (visited.has(key(start))) continue;

      // Flood fill: same id OR substituting wild.
      const stack: CellPos[] = [start];
      const group: CellPos[] = [];
      let lineMult = 1;
      const localVisited = new Set<string>();
      localVisited.add(key(start));

      while (stack.length) {
        const cur = stack.pop()!;
        const curId = grid.columns[cur.col][cur.row];
        const curSym = idx.get(curId);
        if (isWild(curSym)) lineMult *= wildMultiplier(wildCfg);
        group.push(cur);
        for (const nb of orthNeighbours(grid, cur)) {
          if (localVisited.has(key(nb))) continue;
          const nbId = grid.columns[nb.col][nb.row];
          const nbSym = idx.get(nbId);
          const matches =
            nbId === startId ||
            (isWild(nbSym) && wildSubstitutes(wildCfg, startId));
          if (matches) {
            localVisited.add(key(nb));
            stack.push(nb);
          }
        }
      }

      // Mark every cell of this group as globally visited so we don't recount.
      for (const c of group) visited.add(key(c));

      if (group.length >= minCluster) {
        const basePay = ranges
          ? payoutForRanges(startSym, group.length, ranges)
          : payoutFor(startSym, group.length, minCluster);
        if (basePay > 0) {
          wins.push({
            kind: 'cluster',
            symbolId: startId,
            count: group.length,
            basePay,
            multiplier: lineMult,
            pay: basePay * lineMult,
            cells: group,
          });
        }
      }
    }
  }
  return wins;
}

/* ------------------------------ Public API ------------------------------- */

export function evaluate(config: GameConfig, grid: GridResult): EvalResult {
  let wins: WinLine[];
  switch (config.pay.mode) {
    case 'payline':
      wins = evalPaylines(config, grid);
      break;
    case 'ways':
      wins = evalWays(config, grid);
      break;
    case 'cluster':
      wins = evalCluster(config, grid);
      break;
    default:
      wins = [];
  }
  const totalPay = wins.reduce((a, w) => a + w.pay, 0);
  return {
    wins,
    totalPay,
    symbolCounts: countSymbols(grid),
  };
}
