import { z } from 'zod';
import { ruleSetSchema } from '../rules/profiles';
import { checkInvariants } from './invariants';
import type { GameState } from './types';

const seatSchema = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);
const colorSchema = z.enum(['yellow', 'green', 'red', 'blue']);
const pieceIdSchema = z.string().regex(/^(yellow|green|red|blue)-[0-3]$/);

export const gameStateSchema = z.object({
  formatVersion: z.literal(1),
  rules: ruleSetSchema,
  seats: z.array(seatSchema).min(2).max(4),
  players: z
    .array(
      z.object({
        seat: seatSchema,
        color: colorSchema,
        status: z.enum(['active', 'finished', 'left']),
        finishedPieces: z.number().int().min(0).max(4),
        captures: z.number().int().min(0),
        rank: z.number().int().min(1).max(4).nullable(),
      }),
    )
    .min(2)
    .max(4),
  pieces: z
    .array(
      z.object({
        id: pieceIdSchema,
        seat: seatSchema,
        index: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
        progress: z.number().int().min(-1).max(56),
      }),
    )
    .min(8)
    .max(16),
  turn: z.object({
    seat: seatSchema,
    phase: z.enum(['awaiting-roll', 'awaiting-move', 'game-over']),
    dice: z
      .union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6)])
      .nullable(),
    rollsRemaining: z.number().int().min(0).max(10),
    consecutiveSixes: z.number().int().min(0).max(10),
    rollsTaken: z.number().int().min(0),
    number: z.number().int().min(1),
  }),
  status: z.enum(['playing', 'finished']),
  rankings: z.array(seatSchema).max(4),
  winner: seatSchema.nullable(),
  leftOrder: z.array(seatSchema).max(4),
  version: z.number().int().min(0),
});

/**
 * Parses and validates an untrusted serialised GameState (saved games,
 * network snapshots). Returns null if it is malformed or inconsistent.
 */
export function parseGameState(input: unknown): GameState | null {
  const parsed = gameStateSchema.safeParse(input);
  if (!parsed.success) return null;
  const state = parsed.data as GameState;
  return checkInvariants(state).length === 0 ? state : null;
}
