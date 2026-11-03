import { expect } from 'vitest';
import {
  applyAction,
  checkInvariants,
  createGame,
  FINISH_PROGRESS,
  type ApplyResult,
  type GameEvent,
  type GameState,
  type PieceId,
  type RuleSet,
  type SeatIndex,
  type TurnState,
} from '../src';

export interface ScenarioOptions {
  seats?: SeatIndex[];
  rules?: RuleSet;
  /** Explicit piece progress values; unspecified pieces stay in their yards. */
  pieces?: Partial<Record<PieceId, number>>;
  turn?: Partial<TurnState>;
}

/**
 * Builds an arbitrary (but consistent) position. finishedPieces counters are
 * recomputed from the piece positions so invariants hold.
 */
export function scenario(options: ScenarioOptions = {}): GameState {
  const base = createGame({ seats: options.seats ?? [0, 1, 2, 3], rules: options.rules });
  const pieces = base.pieces.map((p) =>
    options.pieces && p.id in options.pieces ? { ...p, progress: options.pieces[p.id]! } : p,
  );
  const players = base.players.map((pl) => ({
    ...pl,
    finishedPieces: pieces.filter((p) => p.seat === pl.seat && p.progress === FINISH_PROGRESS)
      .length,
  }));
  const state: GameState = {
    ...base,
    pieces,
    players,
    turn: { ...base.turn, ...options.turn },
  };
  expect(checkInvariants(state)).toEqual([]);
  return state;
}

export function expectOk(result: ApplyResult): { state: GameState; events: readonly GameEvent[] } {
  if (!result.ok) throw new Error(`Expected ok, got ${result.error}: ${result.message}`);
  expect(checkInvariants(result.state)).toEqual([]);
  return result;
}

export function roll(state: GameState, value: number, seat = state.turn.seat) {
  return expectOk(applyAction(state, { type: 'roll', seat, value }));
}

export function move(state: GameState, pieceId: PieceId, seat = state.turn.seat) {
  return expectOk(applyAction(state, { type: 'move', seat, pieceId }));
}

export function progressOf(state: GameState, pieceId: PieceId): number {
  const piece = state.pieces.find((p) => p.id === pieceId);
  if (!piece) throw new Error(`no piece ${pieceId}`);
  return piece.progress;
}

export function eventTypes(events: readonly GameEvent[]): string[] {
  return events.map((e) => e.type);
}
