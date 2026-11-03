import { z } from 'zod';
import type { GameEvent } from '../engine/types';

/** Colyseus room type name for Ludo matches. */
export const LUDO_ROOM_NAME = 'ludo';

/**
 * Room codes are short, case-insensitive and avoid ambiguous glyphs
 * (no I, L, O, 0, 1) so they can be read aloud or typed on a phone.
 */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;
const ROOM_CODE_RE = new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`);

export function normalizeRoomCode(input: string): string {
  return input.replace(/[\s-]/g, '').toUpperCase();
}

export function isValidRoomCode(code: string): boolean {
  return ROOM_CODE_RE.test(code);
}

export const MAX_DISPLAY_NAME_LENGTH = 20;

/**
 * Normalises a player-chosen display name: strips control and formatting
 * characters, collapses whitespace and limits the length (by code point, so
 * Devanagari and Chinese names are not cut mid-character).
 */
export function sanitizeDisplayName(input: string): string {
  const cleaned = input
    .normalize('NFC')
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  return Array.from(cleaned).slice(0, MAX_DISPLAY_NAME_LENGTH).join('');
}

export const displayNameSchema = z
  .string()
  .max(200)
  .transform(sanitizeDisplayName)
  .pipe(
    z
      .string()
      .min(1)
      .max(MAX_DISPLAY_NAME_LENGTH * 2),
  );

/** Client-generated idempotency key attached to every game command. */
export const actionIdSchema = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);
export const pieceIdSchema = z.string().regex(/^(yellow|green|red|blue)-[0-3]$/);

export const rollCommandSchema = z.object({
  actionId: actionIdSchema,
  /** The state version the client acted on; stale commands are rejected. */
  expectedVersion: z.number().int().min(0),
});

export const moveCommandSchema = z.object({
  actionId: actionIdSchema,
  expectedVersion: z.number().int().min(0),
  pieceId: pieceIdSchema,
});

export const readyCommandSchema = z.object({ ready: z.boolean() });
export const startCommandSchema = z.object({}).passthrough();
export const resignCommandSchema = z.object({ actionId: actionIdSchema });
export const rematchCommandSchema = z.object({}).passthrough();

export type RollCommand = z.infer<typeof rollCommandSchema>;
export type MoveCommand = z.infer<typeof moveCommandSchema>;
export type ReadyCommand = z.infer<typeof readyCommandSchema>;
export type ResignCommand = z.infer<typeof resignCommandSchema>;

export const CLIENT_MESSAGES = {
  roll: 'roll',
  move: 'move',
  ready: 'ready',
  start: 'start',
  resign: 'resign',
  rematch: 'rematch',
} as const;

export const SERVER_MESSAGES = {
  gameEvents: 'game-events',
  actionResult: 'action-result',
  notice: 'notice',
} as const;

/** Broadcast after every accepted game action, in version order. */
export interface GameEventsMessage {
  /** State version after these events were applied. */
  readonly version: number;
  readonly events: readonly GameEvent[];
}

export type ActionRejection =
  'duplicate' | 'stale' | 'not-in-game' | 'rate-limited' | 'invalid-payload' | 'engine-rejected';

export interface ActionResultMessage {
  readonly actionId: string;
  readonly ok: boolean;
  readonly reason?: ActionRejection;
  readonly detail?: string;
}

export type NoticeKind =
  | 'turn-timeout'
  | 'player-dropped'
  | 'player-reconnected'
  | 'player-abandoned'
  | 'session-replaced'
  | 'host-changed';

export interface NoticeMessage {
  readonly kind: NoticeKind;
  readonly seat?: number;
  readonly displayName?: string;
}

export const MATCH_MODES = ['quick', 'private'] as const;
export type MatchMode = (typeof MATCH_MODES)[number];

/** Options a client may send when creating or joining a room. */
export const joinOptionsSchema = z.object({
  displayName: displayNameSchema,
  mode: z.enum(MATCH_MODES).default('quick'),
  playerCount: z.union([z.literal(2), z.literal(3), z.literal(4)]).default(4),
  ruleProfileId: z.string().max(64).optional(),
});
export type JoinOptions = z.input<typeof joinOptionsSchema>;

/** Custom WebSocket close codes (Colyseus reserves 4000-4010). */
export const CLOSE_CODES = {
  sessionReplaced: 4101,
  kickedInactive: 4102,
  roomClosed: 4103,
} as const;
export * from './sync';
