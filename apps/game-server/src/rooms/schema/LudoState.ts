import { schema, t, type SchemaType } from '@colyseus/schema';

/** A participant in the room (lobby and match). */
export const PlayerSchema = schema(
  {
    sessionId: t.string(),
    /** Seat 0–3 (−1 while unassigned). */
    seat: t.int8().default(-1),
    name: t.string(),
    ready: t.boolean().default(false),
    connected: t.boolean().default(true),
    isHost: t.boolean().default(false),
    /** Consecutive turns the server had to play for this player. */
    timeouts: t.uint8().default(0),
    /** Verified identity (uid). Server-side only: never synchronised. */
    identity: t.string().noSync(),
    /** Monotonic join order for seat assignment. Server-side only. */
    joinOrder: t.uint32().noSync(),
  },
  'Player',
);
export type PlayerSchema = SchemaType<typeof PlayerSchema>;

export const PieceSchema = schema(
  {
    id: t.string(),
    seat: t.uint8(),
    index: t.uint8(),
    progress: t.int8(),
  },
  'Piece',
);
export type PieceSchema = SchemaType<typeof PieceSchema>;

export const SeatStatusSchema = schema(
  {
    seat: t.uint8(),
    status: t.string(),
    finishedPieces: t.uint8(),
    captures: t.uint16(),
    /** 0 = not ranked yet. */
    rank: t.uint8(),
  },
  'SeatStatus',
);
export type SeatStatusSchema = SchemaType<typeof SeatStatusSchema>;

/** Mirror of the shared engine's GameState (rules come from `ruleProfileId`). */
export const GameSchema = schema(
  {
    version: t.uint32(),
    status: t.string().default('playing'),
    turnSeat: t.uint8(),
    phase: t.string().default('awaiting-roll'),
    /** 0 = no pending roll. */
    dice: t.uint8(),
    rollsRemaining: t.uint8(),
    consecutiveSixes: t.uint8(),
    rollsTaken: t.uint16(),
    turnNumber: t.uint32(),
    seats: t.array('uint8'),
    players: t.array(SeatStatusSchema),
    pieces: t.array(PieceSchema),
    rankings: t.array('uint8'),
    /** −1 = none. */
    winner: t.int8().default(-1),
    leftOrder: t.array('uint8'),
    /** Epoch ms when the current player's time runs out (0 = no timer). */
    turnDeadline: t.float64(),
  },
  'Game',
);
export type GameSchema = SchemaType<typeof GameSchema>;

export const LudoState = schema(
  {
    /** 'lobby' | 'playing' | 'finished' */
    phase: t.string().default('lobby'),
    code: t.string(),
    mode: t.string(),
    playerCount: t.uint8(),
    ruleProfileId: t.string(),
    themeId: t.string(),
    /** Epoch ms when an automatic start fires (quick match), 0 if none. */
    startsAt: t.float64(),
    players: t.map(PlayerSchema),
    game: t.ref(GameSchema).optional(),
  },
  'LudoState',
);
export type LudoState = SchemaType<typeof LudoState>;
