import { SEAT_COLOR, isSeatIndex, type PieceIndex, type SeatIndex } from '../constants/seats';
import { parseGameState } from '../engine/serialize';
import type { GameState } from '../engine/types';
import type { RuleSet } from '../rules/types';

/**
 * Wire shape of the synchronised game (Colyseus schema on the server, the
 * decoded state object on the client). Collections only need to be iterable,
 * so both plain arrays and Colyseus ArraySchema satisfy it.
 */
export interface SyncedSeatStatus {
  seat: number;
  status: string;
  finishedPieces: number;
  captures: number;
  /** 0 = not ranked. */
  rank: number;
}

export interface SyncedPiece {
  id: string;
  seat: number;
  index: number;
  progress: number;
}

export interface SyncedGame {
  version: number;
  status: string;
  turnSeat: number;
  phase: string;
  /** 0 = none. */
  dice: number;
  rollsRemaining: number;
  consecutiveSixes: number;
  rollsTaken: number;
  turnNumber: number;
  seats: Iterable<number>;
  players: Iterable<SyncedSeatStatus>;
  pieces: Iterable<SyncedPiece>;
  rankings: Iterable<number>;
  /** −1 = none. */
  winner: number;
  leftOrder: Iterable<number>;
  turnDeadline: number;
}

/** Flattens an engine state into the synchronised wire shape. */
export function toSynced(
  state: GameState,
  turnDeadline = 0,
): SyncedGame & {
  seats: number[];
  players: SyncedSeatStatus[];
  pieces: SyncedPiece[];
  rankings: number[];
  leftOrder: number[];
} {
  return {
    version: state.version,
    status: state.status,
    turnSeat: state.turn.seat,
    phase: state.turn.phase,
    dice: state.turn.dice ?? 0,
    rollsRemaining: state.turn.rollsRemaining,
    consecutiveSixes: state.turn.consecutiveSixes,
    rollsTaken: state.turn.rollsTaken,
    turnNumber: state.turn.number,
    seats: [...state.seats],
    players: state.players.map((p) => ({
      seat: p.seat,
      status: p.status,
      finishedPieces: p.finishedPieces,
      captures: p.captures,
      rank: p.rank ?? 0,
    })),
    pieces: state.pieces.map((p) => ({
      id: p.id,
      seat: p.seat,
      index: p.index,
      progress: p.progress,
    })),
    rankings: [...state.rankings],
    winner: state.winner ?? -1,
    leftOrder: [...state.leftOrder],
    turnDeadline,
  };
}

/**
 * Rebuilds and validates an engine GameState from the synchronised shape.
 * Returns null if the data is malformed or inconsistent (e.g. a partial patch).
 */
export function fromSynced(game: SyncedGame, rules: RuleSet): GameState | null {
  const seat = (n: number): SeatIndex => (isSeatIndex(n) ? n : 0);
  const candidate = {
    formatVersion: 1,
    rules,
    seats: Array.from(game.seats),
    players: Array.from(game.players).map((p) => ({
      seat: p.seat,
      color: SEAT_COLOR[seat(p.seat)],
      status: p.status,
      finishedPieces: p.finishedPieces,
      captures: p.captures,
      rank: p.rank > 0 ? p.rank : null,
    })),
    pieces: Array.from(game.pieces).map((p) => ({
      id: p.id,
      seat: p.seat,
      index: p.index as PieceIndex,
      progress: p.progress,
    })),
    turn: {
      seat: game.turnSeat,
      phase: game.phase,
      dice: game.dice > 0 ? game.dice : null,
      rollsRemaining: game.rollsRemaining,
      consecutiveSixes: game.consecutiveSixes,
      rollsTaken: game.rollsTaken,
      number: game.turnNumber,
    },
    status: game.status,
    rankings: Array.from(game.rankings),
    winner: game.winner >= 0 ? game.winner : null,
    leftOrder: Array.from(game.leftOrder),
    version: game.version,
  };
  return parseGameState(candidate);
}
