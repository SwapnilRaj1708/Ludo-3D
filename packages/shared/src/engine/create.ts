import {
  PIECE_INDICES,
  SEAT_COLOR,
  SEAT_INDICES,
  isSeatIndex,
  type SeatIndex,
} from '../constants/seats';
import { YARD_PROGRESS } from '../board/topology';
import { CLASSIC_INDIAN_DIGITAL } from '../rules/profiles';
import type { RuleSet } from '../rules/types';
import type { GameState, PieceId, PieceState, PlayerState } from './types';

export type PlayerCount = 2 | 3 | 4;

export function isPlayerCount(value: unknown): value is PlayerCount {
  return value === 2 || value === 3 || value === 4;
}

/**
 * Seat-allocation policy (docs/GAME_RULES.md §1.3):
 *  - 2 players sit opposite each other: yellow (NW) vs red (SE).
 *  - 3 players take yellow, green and red, leaving blue (SW) empty.
 *  - 4 players use every seat.
 * Callers may supply their own arrangement; it is validated.
 */
export const DEFAULT_SEAT_ARRANGEMENTS: Readonly<Record<PlayerCount, readonly SeatIndex[]>> = {
  2: [0, 2],
  3: [0, 1, 2],
  4: [0, 1, 2, 3],
};

export function allocateSeats(
  playerCount: PlayerCount,
  arrangement?: readonly SeatIndex[],
): SeatIndex[] {
  const seats = arrangement ?? DEFAULT_SEAT_ARRANGEMENTS[playerCount];
  if (seats.length !== playerCount) {
    throw new Error(`Seat arrangement must contain exactly ${playerCount} seats`);
  }
  const unique = new Set(seats);
  if (unique.size !== seats.length || !seats.every(isSeatIndex)) {
    throw new Error('Seat arrangement must contain distinct seats 0-3');
  }
  // Turn order is always clockwise, i.e. ascending seat index.
  return [...seats].sort((a, b) => a - b);
}

export function pieceIdOf(seat: SeatIndex, index: number): PieceId {
  return `${SEAT_COLOR[seat]}-${index}` as PieceId;
}

export interface CreateGameOptions {
  /** Seats taking part (any order; normalised to clockwise). */
  readonly seats: readonly SeatIndex[];
  readonly rules?: RuleSet;
  /** Seat that takes the first turn. Defaults to the first seat clockwise from NW. */
  readonly firstSeat?: SeatIndex;
}

export function createGame(options: CreateGameOptions): GameState {
  const seats = allocateSeats(options.seats.length as PlayerCount, options.seats);
  if (!isPlayerCount(seats.length)) throw new Error('A game needs 2, 3 or 4 players');
  const rules = options.rules ?? CLASSIC_INDIAN_DIGITAL;
  const firstSeat = options.firstSeat ?? seats[0];
  if (firstSeat === undefined || !seats.includes(firstSeat)) {
    throw new Error('firstSeat must be one of the participating seats');
  }

  const players: PlayerState[] = seats.map((seat) => ({
    seat,
    color: SEAT_COLOR[seat],
    status: 'active',
    finishedPieces: 0,
    captures: 0,
    rank: null,
  }));

  const pieces: PieceState[] = seats.flatMap((seat) =>
    PIECE_INDICES.map((index) => ({
      id: pieceIdOf(seat, index),
      seat,
      index,
      progress: YARD_PROGRESS,
    })),
  );

  return {
    formatVersion: 1,
    rules,
    seats,
    players,
    pieces,
    turn: {
      seat: firstSeat,
      phase: 'awaiting-roll',
      dice: null,
      rollsRemaining: 1,
      consecutiveSixes: 0,
      rollsTaken: 0,
      number: 1,
    },
    status: 'playing',
    rankings: [],
    winner: null,
    leftOrder: [],
    version: 0,
  };
}

export const ALL_SEATS: readonly SeatIndex[] = SEAT_INDICES;
