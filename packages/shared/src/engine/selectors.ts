import type { SeatIndex } from '../constants/seats';
import { FINISH_PROGRESS, YARD_PROGRESS } from '../board/topology';
import type { GameState, PieceState, PlayerState } from './types';

export function getPlayer(state: GameState, seat: SeatIndex): PlayerState | undefined {
  return state.players.find((p) => p.seat === seat);
}

export function getPiece(state: GameState, pieceId: string): PieceState | undefined {
  return state.pieces.find((p) => p.id === pieceId);
}

export function piecesOfSeat(state: GameState, seat: SeatIndex): PieceState[] {
  return state.pieces.filter((p) => p.seat === seat);
}

export function yardCount(state: GameState, seat: SeatIndex): number {
  return state.pieces.filter((p) => p.seat === seat && p.progress === YARD_PROGRESS).length;
}

export function finishedCount(state: GameState, seat: SeatIndex): number {
  return state.pieces.filter((p) => p.seat === seat && p.progress === FINISH_PROGRESS).length;
}

export function activeSeats(state: GameState): SeatIndex[] {
  return state.players.filter((p) => p.status === 'active').map((p) => p.seat);
}

export function isSeatsTurn(state: GameState, seat: SeatIndex): boolean {
  return state.status === 'playing' && state.turn.seat === seat;
}
