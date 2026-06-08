/**
 * Grid model. Supports both regular (5x3) and irregular ([3,4,5,4,3]) layouts.
 * A grid is column-major: columns[col] is a bottom-to-top array of symbol ids.
 */

/** Rows per column. Length === number of columns. e.g. [3,3,3,3,3] or [3,4,5,4,3]. */
export type GridShape = number[];

export interface Cell {
  col: number;
  row: number;
  symbolId: string;
}

export interface GridResult {
  cols: number;
  shape: GridShape;
  /** columns[col][row] = symbolId  (row 0 = bottom). */
  columns: string[][];
}

/** Position helper used by cluster / adjacency logic. */
export interface CellPos {
  col: number;
  row: number;
}
