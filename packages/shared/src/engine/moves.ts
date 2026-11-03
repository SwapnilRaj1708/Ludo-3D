import type { SeatIndex } from '../constants/seats';
import {
  FINISH_PROGRESS,
  LAST_TRACK_PROGRESS,
  SEAT_START_INDEX,
  TRACK_LENGTH,
  YARD_PROGRESS,
  isOnTrack,
  trackIndexFor,
} from '../board/topology';
import { safeTrackIndices } from '../rules/profiles';
import type { DiceValue, RuleSet } from '../rules/types';
import type { GameState, Move, MoveKind, PieceId, PieceState } from './types';

/** Pieces standing on each of the 52 shared track squares. */
export type TrackOccupancy = readonly (readonly PieceState[])[];

export function buildTrackOccupancy(state: GameState): TrackOccupancy {
  const occupancy: PieceState[][] = Array.from({ length: TRACK_LENGTH }, () => []);
  const departed = new Set(
    state.players.filter((p) => p.status === 'left').map((p) => p.seat),
  );
  for (const piece of state.pieces) {
    if (departed.has(piece.seat) || !isOnTrack(piece.progress)) continue;
    occupancy[trackIndexFor(piece.seat, piece.progress)]!.push(piece);
  }
  return occupancy;
}

export function isSafeTrackIndex(rules: RuleSet, trackIndex: number): boolean {
  return safeTrackIndices(rules.safeSquares).has(trackIndex);
}

/** True if an opponent of `seat` has a blockade on `trackIndex`. */
export function hasOpponentBlockade(
  rules: RuleSet,
  occupancy: TrackOccupancy,
  trackIndex: number,
  seat: SeatIndex,
): boolean {
  if (!rules.blockade.enabled) return false;
  const counts = new Map<SeatIndex, number>();
  for (const piece of occupancy[trackIndex] ?? []) {
    if (piece.seat === seat) continue;
    const count = (counts.get(piece.seat) ?? 0) + 1;
    if (count >= rules.blockade.minPieces) return true;
    counts.set(piece.seat, count);
  }
  return false;
}

/** True if `seat` itself has a blockade on `trackIndex`. */
export function hasOwnBlockade(
  rules: RuleSet,
  occupancy: TrackOccupancy,
  trackIndex: number,
  seat: SeatIndex,
): boolean {
  if (!rules.blockade.enabled) return false;
  const own = (occupancy[trackIndex] ?? []).filter((p) => p.seat === seat).length;
  return own >= rules.blockade.minPieces;
}

function capturesAt(
  rules: RuleSet,
  occupancy: TrackOccupancy,
  trackIndex: number,
  seat: SeatIndex,
): PieceId[] {
  if (isSafeTrackIndex(rules, trackIndex)) return [];
  return (occupancy[trackIndex] ?? []).filter((p) => p.seat !== seat).map((p) => p.id);
}

/**
 * Evaluates a single piece against a dice value. Returns the move if legal,
 * otherwise null. `occupancy` may be passed in to avoid recomputation.
 */
export function evaluatePieceMove(
  state: GameState,
  piece: PieceState,
  dice: DiceValue,
  occupancy: TrackOccupancy = buildTrackOccupancy(state),
): Move | null {
  const { rules } = state;
  const seat = piece.seat;

  if (piece.progress === FINISH_PROGRESS) return null;

  if (piece.progress === YARD_PROGRESS) {
    if (!rules.entryRolls.includes(dice)) return null;
    const startIndex = SEAT_START_INDEX[seat];
    if (rules.blockade.blocksLanding && hasOpponentBlockade(rules, occupancy, startIndex, seat)) {
      return null;
    }
    return {
      seat,
      pieceId: piece.id,
      kind: 'enter',
      from: YARD_PROGRESS,
      to: 0,
      path: [0],
      captures: capturesAt(rules, occupancy, startIndex, seat),
    };
  }

  const to = piece.progress + dice;
  if (to > FINISH_PROGRESS) return null; // exact roll required to finish

  const path: number[] = [];
  for (let p = piece.progress + 1; p <= to; p++) {
    path.push(p);
    if (p > LAST_TRACK_PROGRESS) continue; // inside the private home lane
    const trackIndex = trackIndexFor(seat, p);
    const blocked = hasOpponentBlockade(rules, occupancy, trackIndex, seat);
    if (!blocked) continue;
    if (p < to && rules.blockade.blocksPassing) return null;
    if (p === to && rules.blockade.blocksLanding) return null;
  }

  const kind: MoveKind = to === FINISH_PROGRESS ? 'finish' : 'advance';
  const captures =
    to <= LAST_TRACK_PROGRESS ? capturesAt(rules, occupancy, trackIndexFor(seat, to), seat) : [];

  return { seat, pieceId: piece.id, kind, from: piece.progress, to, path, captures };
}

/** All legal moves for `seat` with the given dice value. */
export function getLegalMoves(state: GameState, seat: SeatIndex, dice: DiceValue): Move[] {
  if (state.status !== 'playing') return [];
  const player = state.players.find((p) => p.seat === seat);
  if (!player || player.status !== 'active') return [];
  const occupancy = buildTrackOccupancy(state);
  const moves: Move[] = [];
  for (const piece of state.pieces) {
    if (piece.seat !== seat) continue;
    const move = evaluatePieceMove(state, piece, dice, occupancy);
    if (move) moves.push(move);
  }
  return moves;
}

/** Legal moves for the pending roll of the seat whose turn it is. */
export function getCurrentLegalMoves(state: GameState): Move[] {
  if (state.turn.phase !== 'awaiting-move' || state.turn.dice === null) return [];
  return getLegalMoves(state, state.turn.seat, state.turn.dice);
}

/**
 * True when every legal move leads to the same result (e.g. several yard
 * pieces that could enter, or two stacked pieces). UIs may then auto-play.
 */
export function movesAreEquivalent(moves: readonly Move[]): boolean {
  if (moves.length <= 1) return true;
  const [first] = moves;
  return moves.every(
    (m) =>
      m.from === first!.from &&
      m.to === first!.to &&
      m.captures.length === first!.captures.length &&
      m.captures.every((c, i) => c === first!.captures[i]),
  );
}
