import type { SeatIndex } from '../constants/seats';
import {
  FIRST_LANE_PROGRESS,
  LAST_TRACK_PROGRESS,
  SEAT_START_INDEX,
  TRACK_LENGTH,
  YARD_PROGRESS,
  isOnTrack,
  trackIndexFor,
} from '../board/topology';
import { buildTrackOccupancy, isSafeTrackIndex } from '../engine/moves';
import type { GameState, Move } from '../engine/types';
import type { RandomSource } from '../random/dice';

export type BotDifficulty = 'easy' | 'medium' | 'hard';
export const BOT_DIFFICULTIES: readonly BotDifficulty[] = ['easy', 'medium', 'hard'];

/**
 * Number of opponent pieces that could land on `trackIndex` with a single
 * roll on their next turn (ignoring blockades). Safe squares are never
 * threatened.
 */
export function threatAt(state: GameState, trackIndex: number, seat: SeatIndex): number {
  if (isSafeTrackIndex(state.rules, trackIndex)) return 0;
  let threats = 0;
  for (const other of state.players) {
    if (other.seat === seat || other.status !== 'active') continue;
    for (const piece of state.pieces) {
      if (piece.seat !== other.seat) continue;
      if (isOnTrack(piece.progress)) {
        const from = trackIndexFor(piece.seat, piece.progress);
        const distance = (trackIndex - from + TRACK_LENGTH) % TRACK_LENGTH;
        if (distance >= 1 && distance <= 6 && piece.progress + distance <= LAST_TRACK_PROGRESS) {
          threats++;
        }
      } else if (
        piece.progress === YARD_PROGRESS &&
        SEAT_START_INDEX[piece.seat] === trackIndex &&
        state.rules.entryRolls.length > 0
      ) {
        threats++;
      }
    }
  }
  return threats;
}

/** Heuristic value of a move for the moving seat. Higher is better. */
export function scoreMove(state: GameState, move: Move, occupancy = buildTrackOccupancy(state)): number {
  const { seat } = move;
  let score = 0;

  if (move.captures.length > 0) {
    const victims = state.pieces.filter((p) => move.captures.includes(p.id));
    score += 60 + victims.reduce((sum, v) => sum + v.progress * 0.6, 0);
  }
  if (move.kind === 'finish') score += 55;
  if (move.kind === 'enter') {
    const inYard = state.pieces.filter((p) => p.seat === seat && p.progress === YARD_PROGRESS);
    score += 32 + (inYard.length === 4 ? 10 : 0);
  }
  if (move.from < FIRST_LANE_PROGRESS && move.to >= FIRST_LANE_PROGRESS) score += 18;

  const fromThreat =
    isOnTrack(move.from) ? threatAt(state, trackIndexFor(seat, move.from), seat) : 0;
  let toThreat = 0;
  if (isOnTrack(move.to)) {
    const toIndex = trackIndexFor(seat, move.to);
    if (isSafeTrackIndex(state.rules, toIndex)) score += 10;
    toThreat = threatAt(state, toIndex, seat);
    if (state.rules.blockade.enabled) {
      const ownThere = (occupancy[toIndex] ?? []).filter((p) => p.seat === seat).length;
      if (ownThere + 1 >= state.rules.blockade.minPieces) {
        score += 6;
        toThreat = 0; // a blockade cannot be captured
      }
    }
  }
  score += (fromThreat - toThreat) * 14;

  // Gentle preference for advancing pieces that are already far along.
  score += Math.max(move.to, 0) * 0.15;
  return score;
}

export interface BotContext {
  readonly difficulty: BotDifficulty;
  readonly random: RandomSource;
}

/** Picks one of the legal moves. `moves` must be non-empty. */
export function chooseBotMove(state: GameState, moves: readonly Move[], ctx: BotContext): Move {
  if (moves.length === 0) throw new Error('chooseBotMove requires at least one legal move');
  if (moves.length === 1) return moves[0]!;

  const occupancy = buildTrackOccupancy(state);
  if (ctx.difficulty === 'easy' && ctx.random.next() < 0.55) {
    return moves[Math.floor(ctx.random.next() * moves.length)]!;
  }

  const noise = ctx.difficulty === 'hard' ? 0.5 : ctx.difficulty === 'medium' ? 12 : 25;
  let best = moves[0]!;
  let bestScore = -Infinity;
  for (const move of moves) {
    const score = scoreMove(state, move, occupancy) + ctx.random.next() * noise;
    if (score > bestScore) {
      bestScore = score;
      best = move;
    }
  }
  return best;
}
