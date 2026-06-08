import type { GridShape, GridResult, Cell, CellPos } from '@/types';

/**
 * Grid generator. Knows nothing about symbols' meaning — it only manages the
 * geometry of regular and irregular boards.
 */

/** Build a shape array from cols + uniform rows (regular grids). */
export function regularShape(cols: number, rows: number): GridShape {
  return Array.from({ length: cols }, () => rows);
}

/** Total number of cells in a shape. */
export function cellCount(shape: GridShape): number {
  return shape.reduce((a, b) => a + b, 0);
}

/** Maximum rows of any column (the visual height of the board). */
export function maxRows(shape: GridShape): number {
  return shape.reduce((a, b) => Math.max(a, b), 0);
}

/** Create an empty column-major grid filled with a placeholder id. */
export function emptyGrid(shape: GridShape, fill = ''): GridResult {
  return {
    cols: shape.length,
    shape: [...shape],
    columns: shape.map((rows) => Array.from({ length: rows }, () => fill)),
  };
}

/** Flatten a grid to a list of cells (col,row,symbolId). */
export function toCells(grid: GridResult): Cell[] {
  const cells: Cell[] = [];
  for (let col = 0; col < grid.columns.length; col++) {
    const column = grid.columns[col];
    for (let row = 0; row < column.length; row++) {
      cells.push({ col, row, symbolId: column[row] });
    }
  }
  return cells;
}

/** Safe accessor; returns undefined if the cell does not exist in an irregular grid. */
export function cellAt(grid: GridResult, col: number, row: number): string | undefined {
  return grid.columns[col]?.[row];
}

/** Orthogonal neighbours (used by cluster flood-fill). Respects irregular shapes. */
export function orthNeighbours(grid: GridResult, pos: CellPos): CellPos[] {
  const out: CellPos[] = [];
  const candidates: CellPos[] = [
    { col: pos.col - 1, row: pos.row },
    { col: pos.col + 1, row: pos.row },
    { col: pos.col, row: pos.row - 1 },
    { col: pos.col, row: pos.row + 1 },
  ];
  for (const c of candidates) {
    if (grid.columns[c.col]?.[c.row] !== undefined) out.push(c);
  }
  return out;
}

/** Count occurrences of each symbol id on the grid. */
export function countSymbols(grid: GridResult): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const column of grid.columns) {
    for (const id of column) {
      counts[id] = (counts[id] ?? 0) + 1;
    }
  }
  return counts;
}
