/**
 * Seats are the four fixed positions around the board. They are numbered
 * clockwise (as seen from above, north at the top) starting at the north-west
 * yard. Turn order and piece movement are both clockwise, i.e. ascending seat
 * index with wrap-around.
 */
export const SEAT_INDICES = [0, 1, 2, 3] as const;
export type SeatIndex = (typeof SEAT_INDICES)[number];

export const PLAYER_COLORS = ['yellow', 'green', 'red', 'blue'] as const;
export type PlayerColor = (typeof PLAYER_COLORS)[number];

/** Fixed seat → colour mapping. */
export const SEAT_COLOR: Readonly<Record<SeatIndex, PlayerColor>> = {
  0: 'yellow',
  1: 'green',
  2: 'red',
  3: 'blue',
};

export type BoardCorner = 'nw' | 'ne' | 'se' | 'sw';

/** Which corner of the board each seat's starting yard occupies. */
export const SEAT_CORNER: Readonly<Record<SeatIndex, BoardCorner>> = {
  0: 'nw',
  1: 'ne',
  2: 'se',
  3: 'sw',
};

export const PIECES_PER_PLAYER = 4;
export const PIECE_INDICES = [0, 1, 2, 3] as const;
export type PieceIndex = (typeof PIECE_INDICES)[number];

export function isSeatIndex(value: unknown): value is SeatIndex {
  return value === 0 || value === 1 || value === 2 || value === 3;
}

export function seatOfColor(color: PlayerColor): SeatIndex {
  const seat = PLAYER_COLORS.indexOf(color);
  if (!isSeatIndex(seat)) throw new Error(`Unknown colour ${String(color)}`);
  return seat;
}
