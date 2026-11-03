import { SEAT_INDICES, type SeatIndex } from '../constants/seats';
import { HOME_LANE_LENGTH, TRACK_LENGTH } from './topology';

/**
 * Physical layout of the traditional 15×15 Ludo grid.
 *
 * Grid cells are addressed as (col, row), col 0…14 west → east and row 0…14
 * north → south. Continuous board coordinates use the same axes with cell
 * (c, r) spanning [c, c+1] × [r, r+1], so its centre is (c + 0.5, r + 0.5).
 *
 * Only one quadrant is written out by hand; the other three are produced by
 * rotating it 90° clockwise, which guarantees the four seats are symmetric.
 */
export const GRID_SIZE = 15;

export interface GridCell {
  readonly col: number;
  readonly row: number;
}

export interface BoardPoint {
  readonly x: number;
  readonly y: number;
}

/** Rotate a cell 90° clockwise around the board centre. */
export function rotateCellCW(cell: GridCell, times = 1): GridCell {
  let { col, row } = cell;
  for (let i = 0; i < ((times % 4) + 4) % 4; i++) {
    const nextCol = GRID_SIZE - 1 - row;
    row = col;
    col = nextCol;
  }
  return { col, row };
}

/** Rotate a continuous board point 90° clockwise around the board centre. */
export function rotatePointCW(point: BoardPoint, times = 1): BoardPoint {
  let { x, y } = point;
  for (let i = 0; i < ((times % 4) + 4) % 4; i++) {
    const nextX = GRID_SIZE - y;
    y = x;
    x = nextX;
  }
  return { x, y };
}

export function cellCenter(cell: GridCell): BoardPoint {
  return { x: cell.col + 0.5, y: cell.row + 0.5 };
}

/**
 * Track squares 0…12 — the quadrant that begins at seat 0's (yellow, NW)
 * start square and ends just before seat 1's start square.
 */
const QUADRANT_TRACK: readonly GridCell[] = [
  { col: 1, row: 6 }, // 0  yellow start
  { col: 2, row: 6 },
  { col: 3, row: 6 },
  { col: 4, row: 6 },
  { col: 5, row: 6 },
  { col: 6, row: 5 }, // 5  diagonal step around the centre corner
  { col: 6, row: 4 },
  { col: 6, row: 3 },
  { col: 6, row: 2 }, // 8  star
  { col: 6, row: 1 },
  { col: 6, row: 0 },
  { col: 7, row: 0 }, // 11 green's home-entry square
  { col: 8, row: 0 },
];

/** All 52 shared track squares in clockwise order. Index = global track index. */
export const TRACK_CELLS: readonly GridCell[] = SEAT_INDICES.flatMap((seat) =>
  QUADRANT_TRACK.map((cell) => rotateCellCW(cell, seat)),
);

const QUADRANT_HOME_LANE: readonly GridCell[] = [
  { col: 1, row: 7 },
  { col: 2, row: 7 },
  { col: 3, row: 7 },
  { col: 4, row: 7 },
  { col: 5, row: 7 },
];

/** Each seat's five home-lane squares, ordered from the entry towards the centre. */
export const HOME_LANE_CELLS: Readonly<Record<SeatIndex, readonly GridCell[]>> = {
  0: QUADRANT_HOME_LANE.map((c) => rotateCellCW(c, 0)),
  1: QUADRANT_HOME_LANE.map((c) => rotateCellCW(c, 1)),
  2: QUADRANT_HOME_LANE.map((c) => rotateCellCW(c, 2)),
  3: QUADRANT_HOME_LANE.map((c) => rotateCellCW(c, 3)),
};

export interface GridRect {
  readonly minCol: number;
  readonly minRow: number;
  readonly maxCol: number;
  readonly maxRow: number;
}

function rotateRect(rect: GridRect, times: number): GridRect {
  const a = rotateCellCW({ col: rect.minCol, row: rect.minRow }, times);
  const b = rotateCellCW({ col: rect.maxCol, row: rect.maxRow }, times);
  return {
    minCol: Math.min(a.col, b.col),
    minRow: Math.min(a.row, b.row),
    maxCol: Math.max(a.col, b.col),
    maxRow: Math.max(a.row, b.row),
  };
}

const QUADRANT_YARD: GridRect = { minCol: 0, minRow: 0, maxCol: 5, maxRow: 5 };

/** The 6×6 starting yard of each seat (inclusive cell bounds). */
export const YARD_RECTS: Readonly<Record<SeatIndex, GridRect>> = {
  0: rotateRect(QUADRANT_YARD, 0),
  1: rotateRect(QUADRANT_YARD, 1),
  2: rotateRect(QUADRANT_YARD, 2),
  3: rotateRect(QUADRANT_YARD, 3),
};

/** The central 3×3 finishing area. */
export const CENTER_RECT: GridRect = { minCol: 6, minRow: 6, maxCol: 8, maxRow: 8 };

const YARD_SLOT_SPREAD = 1.15;
const QUADRANT_YARD_SLOTS: readonly BoardPoint[] = [
  { x: 3 - YARD_SLOT_SPREAD, y: 3 - YARD_SLOT_SPREAD },
  { x: 3 + YARD_SLOT_SPREAD, y: 3 - YARD_SLOT_SPREAD },
  { x: 3 - YARD_SLOT_SPREAD, y: 3 + YARD_SLOT_SPREAD },
  { x: 3 + YARD_SLOT_SPREAD, y: 3 + YARD_SLOT_SPREAD },
];

/** Resting positions (board coordinates) of the four pieces inside each yard. */
export const YARD_SLOTS: Readonly<Record<SeatIndex, readonly BoardPoint[]>> = {
  0: QUADRANT_YARD_SLOTS.map((p) => rotatePointCW(p, 0)),
  1: QUADRANT_YARD_SLOTS.map((p) => rotatePointCW(p, 1)),
  2: QUADRANT_YARD_SLOTS.map((p) => rotatePointCW(p, 2)),
  3: QUADRANT_YARD_SLOTS.map((p) => rotatePointCW(p, 3)),
};

/**
 * Seat 0's finishing triangle is the western quarter of the centre square,
 * with vertices (6,6), (6,9) and the centre (7.5,7.5). Finished pieces rest
 * inside it.
 */
const QUADRANT_FINISH_SLOTS: readonly BoardPoint[] = [
  { x: 6.42, y: 6.95 },
  { x: 6.42, y: 8.05 },
  { x: 6.85, y: 7.22 },
  { x: 6.85, y: 7.78 },
];

export const FINISH_SLOTS: Readonly<Record<SeatIndex, readonly BoardPoint[]>> = {
  0: QUADRANT_FINISH_SLOTS.map((p) => rotatePointCW(p, 0)),
  1: QUADRANT_FINISH_SLOTS.map((p) => rotatePointCW(p, 1)),
  2: QUADRANT_FINISH_SLOTS.map((p) => rotatePointCW(p, 2)),
  3: QUADRANT_FINISH_SLOTS.map((p) => rotatePointCW(p, 3)),
};

/** Triangle vertices of each seat's finishing area (board coordinates). */
export const FINISH_TRIANGLES: Readonly<Record<SeatIndex, readonly BoardPoint[]>> = {
  0: [
    { x: 6, y: 6 },
    { x: 6, y: 9 },
    { x: 7.5, y: 7.5 },
  ].map((p) => rotatePointCW(p, 0)),
  1: [
    { x: 6, y: 6 },
    { x: 6, y: 9 },
    { x: 7.5, y: 7.5 },
  ].map((p) => rotatePointCW(p, 1)),
  2: [
    { x: 6, y: 6 },
    { x: 6, y: 9 },
    { x: 7.5, y: 7.5 },
  ].map((p) => rotatePointCW(p, 2)),
  3: [
    { x: 6, y: 6 },
    { x: 6, y: 9 },
    { x: 7.5, y: 7.5 },
  ].map((p) => rotatePointCW(p, 3)),
};

/** Unit direction of travel on each track square (board coordinates). */
export function trackDirection(trackIndex: number): BoardPoint {
  const here = TRACK_CELLS[trackIndex];
  const next = TRACK_CELLS[(trackIndex + 1) % TRACK_LENGTH];
  if (!here || !next) throw new RangeError(`invalid track index ${trackIndex}`);
  const dx = next.col - here.col;
  const dy = next.row - here.row;
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

export const LAYOUT_SANITY = {
  trackLength: TRACK_LENGTH,
  homeLaneLength: HOME_LANE_LENGTH,
} as const;
