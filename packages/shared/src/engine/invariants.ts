import { PIECES_PER_PLAYER } from '../constants/seats';
import { FINISH_PROGRESS, isValidProgress } from '../board/topology';
import { buildTrackOccupancy, isSafeTrackIndex } from './moves';
import type { GameState } from './types';

/**
 * Structural invariants that must hold for every reachable state. Returns a
 * list of human-readable violations (empty when the state is consistent).
 * Used by simulation tests and as a guard when loading untrusted snapshots.
 */
export function checkInvariants(state: GameState): string[] {
  const violations: string[] = [];
  const { rules } = state;

  if (state.players.length !== state.seats.length) violations.push('players/seats length mismatch');
  if (state.pieces.length !== state.seats.length * PIECES_PER_PLAYER) {
    violations.push('wrong number of pieces');
  }

  const ids = new Set<string>();
  for (const piece of state.pieces) {
    if (ids.has(piece.id)) violations.push(`duplicate piece ${piece.id}`);
    ids.add(piece.id);
    if (!isValidProgress(piece.progress)) violations.push(`${piece.id} invalid progress`);
    if (!state.seats.includes(piece.seat)) violations.push(`${piece.id} belongs to absent seat`);
  }

  for (const player of state.players) {
    const finished = state.pieces.filter(
      (p) => p.seat === player.seat && p.progress === FINISH_PROGRESS,
    ).length;
    if (player.status !== 'left' && finished !== player.finishedPieces) {
      violations.push(`seat ${player.seat} finishedPieces ${player.finishedPieces} != ${finished}`);
    }
    if (player.status === 'finished' && player.finishedPieces !== PIECES_PER_PLAYER) {
      violations.push(`seat ${player.seat} marked finished early`);
    }
    if (player.status === 'active' && player.finishedPieces === PIECES_PER_PLAYER) {
      violations.push(`seat ${player.seat} finished but still active`);
    }
  }

  // A non-safe square never holds pieces of two different seats: the second
  // arrival always captures. Blockade sizes are bounded by the rules.
  const occupancy = buildTrackOccupancy(state);
  occupancy.forEach((pieces, trackIndex) => {
    const seats = new Set(pieces.map((p) => p.seat));
    if (seats.size > 1 && !isSafeTrackIndex(rules, trackIndex)) {
      violations.push(`square ${trackIndex} holds several colours`);
    }
  });

  if (state.status === 'playing') {
    const current = state.players.find((p) => p.seat === state.turn.seat);
    if (current?.status !== 'active') violations.push('turn belongs to an inactive player');
    if (state.turn.phase === 'game-over') violations.push('playing state in game-over phase');
    if (state.turn.phase === 'awaiting-move' && state.turn.dice === null) {
      violations.push('awaiting move without a dice value');
    }
    if (state.turn.phase === 'awaiting-roll' && state.turn.rollsRemaining < 1) {
      violations.push('awaiting roll with no rolls remaining');
    }
  } else {
    if (state.rankings.length !== state.seats.length) violations.push('incomplete final rankings');
    const ranks = state.players.map((p) => p.rank);
    if (new Set(ranks).size !== ranks.length || ranks.some((r) => r === null)) {
      violations.push('final ranks not unique');
    }
  }

  return violations;
}
