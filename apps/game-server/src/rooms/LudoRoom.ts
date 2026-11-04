import { randomInt } from 'node:crypto';
import {
  CloseCode,
  Room,
  matchMaker,
  type AuthContext,
  type Client,
  type Delayed,
} from '@colyseus/core';
import { z } from 'zod';
import {
  CLASSIC_INDIAN_DIGITAL,
  DEFAULT_RULE_PROFILE_ID,
  DEFAULT_SEAT_ARRANGEMENTS,
  DEFAULT_THEME_ID,
  applyAction,
  createCryptoDice,
  createGame,
  getRuleProfile,
  nextAutoAction,
  type ApplyResult,
  type GameAction,
  type GameState,
  type PlayerCount,
  type SeatIndex,
} from '@ludo3d/shared';
import {
  CLIENT_MESSAGES,
  CLOSE_CODES,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  SERVER_MESSAGES,
  displayNameSchema,
  moveCommandSchema,
  readyCommandSchema,
  resignCommandSchema,
  rollCommandSchema,
  toSynced,
  type ActionRejection,
  type ActionResultMessage,
  type GameEventsMessage,
  type NoticeMessage,
} from '@ludo3d/shared/protocol';
import { env } from '../config/env.js';
import { verifyIdentityToken, type VerifiedIdentity } from '../authentication/verify.js';
import { matchStore, type MatchSummary } from '../services/matchStore.js';
import { logger } from '../services/logger.js';
import { RecentIds } from '../validation/idempotency.js';
import { TokenBucket } from '../validation/rateLimiter.js';
import {
  GameSchema,
  LudoState,
  PieceSchema,
  PlayerSchema,
  SeatStatusSchema,
} from './schema/LudoState.js';

const createOptionsSchema = z.object({
  mode: z.enum(['quick', 'private']).default('quick'),
  playerCount: z.union([z.literal(2), z.literal(3), z.literal(4)]).default(4),
  ruleProfileId: z.string().max(64).optional(),
});

const joinSchema = z.object({ displayName: displayNameSchema });

/** After this many consecutive timeouts a player's turns are played immediately. */
const INACTIVE_AFTER_TIMEOUTS = 3;
const INACTIVE_TURN_MS = 2_500;
const QUICK_START_DELAY_MS = 3_000;
const LOBBY_IDLE_LIMIT_MS = 30 * 60_000;
const FINISHED_IDLE_LIMIT_MS = 10 * 60_000;

interface UserData {
  identity: VerifiedIdentity;
  /** Set when a newer connection of the same identity took over this seat. */
  replaced?: boolean;
}

type LudoClient = Client<{ userData: UserData; auth: VerifiedIdentity }>;

/**
 * Authoritative Ludo room. Clients only send intents (ready, start, roll,
 * move, resign); the server validates each one, generates dice with a CSPRNG,
 * applies the shared rules engine and broadcasts the resulting events. The
 * synchronised schema mirrors the engine state for late joiners/reconnects.
 */
export class LudoRoom extends Room<{ state: LudoState; client: LudoClient }> {
  override state = new LudoState();
  override maxClients = 4;
  override maxMessagesPerSecond = 40;
  override seatReservationTimeout = 15;

  private engine: GameState | null = null;
  private readonly dice = createCryptoDice();
  private readonly botRandom = { next: () => randomInt(0, 1_000_000) / 1_000_000 };
  private turnTimer: Delayed | null = null;
  private startTimer: Delayed | null = null;
  private idleTimer: Delayed | null = null;
  private readonly recentIds = new Map<string, RecentIds>();
  private readonly buckets = new Map<string, TokenBucket>();
  private invalidMessages = new Map<string, number>();
  private joinCounter = 0;
  private startedAt = 0;
  private actions = 0;
  private matchId = '';

  override messages = {
    [CLIENT_MESSAGES.ready]: (client: LudoClient, payload: unknown) =>
      this.handleReady(client, payload),
    [CLIENT_MESSAGES.start]: (client: LudoClient) => this.handleStart(client),
    [CLIENT_MESSAGES.roll]: (client: LudoClient, payload: unknown) =>
      this.handleRoll(client, payload),
    [CLIENT_MESSAGES.move]: (client: LudoClient, payload: unknown) =>
      this.handleMove(client, payload),
    [CLIENT_MESSAGES.resign]: (client: LudoClient, payload: unknown) =>
      this.handleResign(client, payload),
    [CLIENT_MESSAGES.rematch]: (client: LudoClient) => this.handleRematch(client),
    '*': (client: LudoClient) => this.countInvalid(client),
  };

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  static override async onAuth(token: string, _options: unknown, _context: AuthContext) {
    const identity = await verifyIdentityToken(token);
    if (!identity) throw new Error('unauthorized');
    return identity;
  }

  override async onCreate(options: unknown) {
    const parsed = createOptionsSchema.parse(options ?? {});
    const ruleProfileId =
      parsed.mode === 'private' && parsed.ruleProfileId && getRuleProfile(parsed.ruleProfileId)
        ? parsed.ruleProfileId
        : DEFAULT_RULE_PROFILE_ID;

    const code = await this.allocateCode();
    this.roomId = code;
    this.state.code = code;
    this.state.mode = parsed.mode;
    this.state.playerCount = parsed.playerCount;
    this.state.ruleProfileId = ruleProfileId;
    this.state.themeId = DEFAULT_THEME_ID;
    // One spare slot lets a seated player's new tab/device connect and take
    // over the seat; onJoin enforces the real capacity and membership.
    this.maxClients = parsed.playerCount + 1;
    if (parsed.mode === 'private') await this.setPrivate(true);
    this.resetIdleTimer(LOBBY_IDLE_LIMIT_MS);
    logger.info({ code, mode: parsed.mode, playerCount: parsed.playerCount }, 'room created');
  }

  override onJoin(client: LudoClient, options: unknown, auth: VerifiedIdentity) {
    const { displayName } = joinSchema.parse(options ?? {});
    client.userData = { identity: auth };

    // Same identity already seated (second tab, new device, or refresh without
    // a reconnection token): the newest connection takes over the seat.
    const existing = this.findPlayerByIdentity(auth.uid);
    if (existing) {
      const [oldSessionId, player] = existing;
      const oldClient = this.clients.find((c) => c.sessionId === oldSessionId);
      if (oldClient) {
        oldClient.userData = { ...oldClient.userData!, replaced: true };
        oldClient.send(SERVER_MESSAGES.notice, {
          kind: 'session-replaced',
        } satisfies NoticeMessage);
        oldClient.leave(CLOSE_CODES.sessionReplaced);
      }
      this.state.players.delete(oldSessionId);
      player.sessionId = client.sessionId;
      player.connected = true;
      player.name = displayName;
      this.state.players.set(client.sessionId, player);
      logger.info(
        { code: this.state.code, seat: player.seat },
        'seat taken over by a newer connection',
      );
      return;
    }

    if (this.state.phase !== 'lobby') throw new Error('match already started');
    if (this.state.players.size >= this.state.playerCount) throw new Error('room is full');

    const player = new PlayerSchema();
    player.sessionId = client.sessionId;
    player.name = displayName;
    player.identity = auth.uid;
    player.joinOrder = this.joinCounter++;
    player.ready = this.state.mode === 'quick';
    player.isHost = this.state.players.size === 0;
    this.state.players.set(client.sessionId, player);
    this.assignLobbySeats();
    this.maybeScheduleQuickStart();
  }

  override onDrop(client: LudoClient) {
    const player = this.state.players.get(client.sessionId);
    if (!player || client.userData?.replaced) return;
    player.connected = false;
    this.broadcastNotice({ kind: 'player-dropped', seat: player.seat, displayName: player.name });
    try {
      // Outcome is routed to onReconnect / onLeave; the deferred itself is not awaited.
      Promise.resolve(this.allowReconnection(client, env().RECONNECT_GRACE_SECONDS)).catch(
        () => undefined,
      );
    } catch {
      // The room is disposing (server shutdown): nothing to wait for.
    }
    // A dropped player's turn keeps its clock; the server plays it on timeout.
  }

  override onReconnect(client: LudoClient) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    player.connected = true;
    this.broadcastNotice({
      kind: 'player-reconnected',
      seat: player.seat,
      displayName: player.name,
    });
  }

  override onLeave(client: LudoClient, code?: number) {
    if (client.userData?.replaced) return;
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    if (this.state.phase === 'lobby') {
      this.state.players.delete(client.sessionId);
      this.reassignHost();
      this.assignLobbySeats();
      this.cancelQuickStart();
      return;
    }

    if (this.state.phase === 'playing' && this.engine) {
      // Gone for good (consented leave or reconnection window expired).
      if (code !== CloseCode.CONSENTED) {
        this.broadcastNotice({
          kind: 'player-abandoned',
          seat: player.seat,
          displayName: player.name,
        });
      }
      this.applyAndCommit({ type: 'leave', seat: player.seat as SeatIndex });
    }
    player.connected = false;
    this.state.players.delete(client.sessionId);
    this.reassignHost();
  }

  /** Room-level exception hook: report, never crash the process. */
  override onUncaughtException(error: Error, methodName: string) {
    logger.error(
      { code: this.state.code, methodName, error: error.stack ?? String(error) },
      'room error',
    );
  }

  override onDispose() {
    this.turnTimer?.clear();
    this.startTimer?.clear();
    this.idleTimer?.clear();
  }

  // -------------------------------------------------------------------------
  // Lobby
  // -------------------------------------------------------------------------

  private handleReady(client: LudoClient, payload: unknown) {
    const parsed = readyCommandSchema.safeParse(payload);
    const player = this.state.players.get(client.sessionId);
    if (!parsed.success || !player) return this.countInvalid(client);
    if (this.state.phase !== 'lobby') return;
    player.ready = parsed.data.ready;
  }

  private handleStart(client: LudoClient) {
    const player = this.state.players.get(client.sessionId);
    if (!player?.isHost || this.state.phase !== 'lobby') return;
    const players = [...this.state.players.values()];
    if (players.length < 2 || players.some((p) => !p.ready)) return;
    this.startMatch();
  }

  private handleRematch(client: LudoClient) {
    const player = this.state.players.get(client.sessionId);
    if (!player?.isHost || this.state.phase !== 'finished') return;
    this.engine = null;
    this.state.game = undefined;
    this.state.phase = 'lobby';
    for (const p of this.state.players.values()) {
      p.ready = this.state.mode === 'quick';
      p.timeouts = 0;
    }
    this.assignLobbySeats();
    if (this.state.mode === 'quick') void this.setPrivate(false);
    this.resetIdleTimer(LOBBY_IDLE_LIMIT_MS);
    this.maybeScheduleQuickStart();
  }

  /** Seats always reflect the arrangement the match would use right now. */
  private assignLobbySeats() {
    const players = [...this.state.players.values()].sort((a, b) => a.joinOrder - b.joinOrder);
    const n = Math.max(2, Math.min(4, players.length)) as PlayerCount;
    const arrangement = DEFAULT_SEAT_ARRANGEMENTS[n];
    players.forEach((p, i) => {
      p.seat = arrangement[i] ?? -1;
    });
  }

  private reassignHost() {
    const players = [...this.state.players.values()].sort((a, b) => a.joinOrder - b.joinOrder);
    if (players.length > 0 && !players.some((p) => p.isHost)) players[0]!.isHost = true;
  }

  private maybeScheduleQuickStart() {
    if (this.state.mode !== 'quick' || this.state.phase !== 'lobby') return;
    if (this.state.players.size < this.state.playerCount || this.startTimer) return;
    this.state.startsAt = Date.now() + QUICK_START_DELAY_MS;
    this.startTimer = this.clock.setTimeout(() => {
      this.startTimer = null;
      if (this.state.phase === 'lobby' && this.state.players.size >= 2) this.startMatch();
    }, QUICK_START_DELAY_MS);
  }

  private cancelQuickStart() {
    this.startTimer?.clear();
    this.startTimer = null;
    this.state.startsAt = 0;
  }

  private startMatch() {
    this.cancelQuickStart();
    this.assignLobbySeats();
    const seats = [...this.state.players.values()]
      .map((p) => p.seat as SeatIndex)
      .sort((a, b) => a - b);
    const rules = getRuleProfile(this.state.ruleProfileId) ?? CLASSIC_INDIAN_DIGITAL;
    const firstSeat = seats[randomInt(0, seats.length)]!;
    this.engine = createGame({ seats, rules, firstSeat });
    this.state.game = new GameSchema();
    this.state.phase = 'playing';
    this.startedAt = Date.now();
    this.actions = 0;
    this.matchId = `${this.state.code}-${this.startedAt.toString(36)}`;
    for (const p of this.state.players.values()) p.timeouts = 0;
    // Started rooms leave matchmaking; seated players can still reconnect by id.
    if (this.state.mode === 'quick') void this.setPrivate(true);
    this.idleTimer?.clear();
    this.syncGame();
    this.scheduleTurnTimer(0);
    this.broadcast(SERVER_MESSAGES.gameEvents, {
      version: this.engine.version,
      events: [{ type: 'turn-started', seat: firstSeat, turnNumber: 1 }],
    } satisfies GameEventsMessage);
    logger.info({ code: this.state.code, seats }, 'match started');
  }

  // -------------------------------------------------------------------------
  // Game commands
  // -------------------------------------------------------------------------

  private reply(client: LudoClient, message: ActionResultMessage) {
    client.send(SERVER_MESSAGES.actionResult, message);
  }

  /**
   * Common checks for every game command: payload shape, rate limit, seat,
   * idempotency and freshness. Returns the player's seat, or null if rejected.
   */
  private admit(
    client: LudoClient,
    actionId: string,
    expectedVersion: number | undefined,
  ): SeatIndex | null {
    const player = this.state.players.get(client.sessionId);
    const reject = (reason: ActionRejection, detail?: string) => {
      this.reply(client, { actionId, ok: false, reason, detail });
      return null;
    };
    if (!this.bucket(client).take()) return reject('rate-limited');
    if (!player || !this.engine || this.state.phase !== 'playing' || player.seat < 0) {
      return reject('not-in-game');
    }
    const ids = this.recentIds.get(player.identity) ?? new RecentIds();
    this.recentIds.set(player.identity, ids);
    if (!ids.remember(actionId)) return reject('duplicate');
    if (expectedVersion !== undefined && expectedVersion !== this.engine.version) {
      return reject('stale', `server version ${this.engine.version}`);
    }
    return player.seat as SeatIndex;
  }

  private handleRoll(client: LudoClient, payload: unknown) {
    const parsed = rollCommandSchema.safeParse(payload);
    if (!parsed.success) return this.rejectInvalid(client, payload);
    const seat = this.admit(client, parsed.data.actionId, parsed.data.expectedVersion);
    if (seat === null) return;
    this.markActive(client);
    // The client never supplies the dice value: it is generated here.
    this.respond(
      client,
      parsed.data.actionId,
      this.applyAndCommit({ type: 'roll', seat, value: this.dice.roll() }),
    );
  }

  private handleMove(client: LudoClient, payload: unknown) {
    const parsed = moveCommandSchema.safeParse(payload);
    if (!parsed.success) return this.rejectInvalid(client, payload);
    const seat = this.admit(client, parsed.data.actionId, parsed.data.expectedVersion);
    if (seat === null) return;
    this.markActive(client);
    this.respond(
      client,
      parsed.data.actionId,
      this.applyAndCommit({ type: 'move', seat, pieceId: parsed.data.pieceId }),
    );
  }

  private handleResign(client: LudoClient, payload: unknown) {
    const parsed = resignCommandSchema.safeParse(payload);
    if (!parsed.success) return this.rejectInvalid(client, payload);
    const seat = this.admit(client, parsed.data.actionId, undefined);
    if (seat === null) return;
    this.respond(client, parsed.data.actionId, this.applyAndCommit({ type: 'leave', seat }));
  }

  private respond(client: LudoClient, actionId: string, result: ApplyResult) {
    this.reply(
      client,
      result.ok
        ? { actionId, ok: true }
        : { actionId, ok: false, reason: 'engine-rejected', detail: result.error },
    );
  }

  private rejectInvalid(client: LudoClient, payload: unknown) {
    const actionId =
      typeof (payload as { actionId?: unknown })?.actionId === 'string'
        ? String((payload as { actionId: string }).actionId).slice(0, 64)
        : '';
    this.reply(client, { actionId, ok: false, reason: 'invalid-payload' });
    this.countInvalid(client);
  }

  /** Repeatedly malformed traffic is treated as abuse and disconnected. */
  private countInvalid(client: LudoClient) {
    const n = (this.invalidMessages.get(client.sessionId) ?? 0) + 1;
    this.invalidMessages.set(client.sessionId, n);
    if (n > 25) client.leave(CloseCode.WITH_ERROR);
  }

  private bucket(client: LudoClient): TokenBucket {
    let bucket = this.buckets.get(client.sessionId);
    if (!bucket) {
      bucket = new TokenBucket(20, 10);
      this.buckets.set(client.sessionId, bucket);
    }
    return bucket;
  }

  private markActive(client: LudoClient) {
    const player = this.state.players.get(client.sessionId);
    if (player) player.timeouts = 0;
  }

  // -------------------------------------------------------------------------
  // Engine integration
  // -------------------------------------------------------------------------

  private applyAndCommit(action: GameAction): ApplyResult {
    if (!this.engine) return { ok: false, error: 'game-over', message: 'No match in progress' };
    const result = applyAction(this.engine, action);
    if (!result.ok) return result;
    this.engine = result.state;
    this.actions++;
    this.syncGame();
    this.broadcast(SERVER_MESSAGES.gameEvents, {
      version: result.state.version,
      events: result.events,
    } satisfies GameEventsMessage);

    if (result.state.status === 'finished') {
      void this.finishMatch(result.state);
    } else {
      const animated = result.events.some(
        (e) => e.type === 'piece-moved' || e.type === 'dice-rolled',
      );
      this.scheduleTurnTimer(animated ? env().ANIMATION_ALLOWANCE_MS : 0);
    }
    return result;
  }

  /** Copies the engine state into the synchronised schema (in place, for small deltas). */
  private syncGame() {
    const engine = this.engine;
    const game = this.state.game;
    if (!engine || !game) return;
    const synced = toSynced(engine, game.turnDeadline);
    game.version = synced.version;
    game.status = synced.status;
    game.turnSeat = synced.turnSeat;
    game.phase = synced.phase;
    game.dice = synced.dice;
    game.rollsRemaining = synced.rollsRemaining;
    game.consecutiveSixes = synced.consecutiveSixes;
    game.rollsTaken = synced.rollsTaken;
    game.turnNumber = synced.turnNumber;
    game.winner = synced.winner;
    syncNumbers(game.seats, synced.seats);
    syncNumbers(game.rankings, synced.rankings);
    syncNumbers(game.leftOrder, synced.leftOrder);
    synced.players.forEach((p, i) => {
      const target = game.players[i] ?? new SeatStatusSchema();
      target.seat = p.seat;
      target.status = p.status;
      target.finishedPieces = p.finishedPieces;
      target.captures = p.captures;
      target.rank = p.rank;
      if (!game.players[i]) game.players.push(target);
    });
    synced.pieces.forEach((p, i) => {
      const target = game.pieces[i] ?? new PieceSchema();
      target.id = p.id;
      target.seat = p.seat;
      target.index = p.index;
      target.progress = p.progress;
      if (!game.pieces[i]) game.pieces.push(target);
    });
  }

  private scheduleTurnTimer(allowanceMs: number) {
    this.turnTimer?.clear();
    const engine = this.engine;
    const game = this.state.game;
    if (!engine || !game || engine.status !== 'playing') return;
    const seat = engine.turn.seat;
    const player = this.playerAtSeat(seat);
    const inactive = !player || (player.timeouts ?? 0) >= INACTIVE_AFTER_TIMEOUTS;
    const limit = inactive ? INACTIVE_TURN_MS : env().TURN_SECONDS * 1000;
    game.turnDeadline = Date.now() + allowanceMs + limit;
    const version = engine.version;
    this.turnTimer = this.clock.setTimeout(() => this.onTurnTimeout(version), allowanceMs + limit);
  }

  /** The current player ran out of time: the server acts for them like a bot. */
  private onTurnTimeout(version: number) {
    const engine = this.engine;
    if (!engine || engine.version !== version || engine.status !== 'playing') return;
    const seat = engine.turn.seat;
    const player = this.playerAtSeat(seat);
    if (player) {
      player.timeouts = Math.min(255, (player.timeouts ?? 0) + 1);
      this.broadcastNotice({ kind: 'turn-timeout', seat, displayName: player.name });
    }
    const action = nextAutoAction(engine, {
      dice: this.dice,
      random: this.botRandom,
      difficulty: 'medium',
    });
    if (action) this.applyAndCommit(action);
  }

  private async finishMatch(state: GameState) {
    this.turnTimer?.clear();
    this.state.phase = 'finished';
    if (this.state.game) this.state.game.turnDeadline = 0;
    this.resetIdleTimer(FINISHED_IDLE_LIMIT_MS);
    const players = [...this.state.players.values()];
    const summary: MatchSummary = {
      matchId: this.matchId,
      roomCode: this.state.code,
      mode: this.state.mode,
      ruleProfileId: this.state.ruleProfileId,
      startedAt: this.startedAt,
      endedAt: Date.now(),
      winnerSeat: state.winner,
      actions: this.actions,
      players: state.players.map((p) => {
        const seated = players.find((pl) => pl.seat === p.seat);
        const identity = seated
          ? this.clients.find((c) => c.sessionId === seated.sessionId)?.userData?.identity
          : undefined;
        return {
          seat: p.seat,
          name: seated?.name ?? '',
          uid: identity?.provider === 'firebase' ? identity.uid : null,
          rank: p.rank ?? 0,
          finishedPieces: p.finishedPieces,
          captures: p.captures,
          left: p.status === 'left',
        };
      }),
    };
    try {
      await matchStore().save(summary);
    } catch (error) {
      logger.error(
        { error: String(error), matchId: this.matchId },
        'failed to persist match summary',
      );
    }
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private playerAtSeat(seat: number): PlayerSchema | undefined {
    return [...this.state.players.values()].find((p) => p.seat === seat);
  }

  private findPlayerByIdentity(uid: string): [string, PlayerSchema] | undefined {
    for (const [sessionId, player] of this.state.players) {
      if (player.identity === uid) return [sessionId, player];
    }
    return undefined;
  }

  private broadcastNotice(notice: NoticeMessage) {
    this.broadcast(SERVER_MESSAGES.notice, notice);
  }

  private resetIdleTimer(ms: number) {
    this.idleTimer?.clear();
    this.idleTimer = this.clock.setTimeout(() => {
      logger.info({ code: this.state.code, phase: this.state.phase }, 'closing idle room');
      void this.disconnect(CLOSE_CODES.roomClosed);
    }, ms);
  }

  /** Unique, unambiguous 6-character code, also used as the room id. */
  private async allocateCode(): Promise<string> {
    for (let attempt = 0; attempt < 20; attempt++) {
      let code = '';
      for (let i = 0; i < ROOM_CODE_LENGTH; i++)
        code += ROOM_CODE_ALPHABET[randomInt(0, ROOM_CODE_ALPHABET.length)];
      if (!(await matchMaker.getRoomById(code))) return code;
    }
    throw new Error('could not allocate a unique room code');
  }

  /** Test helper: the authoritative engine state. */
  get engineState(): GameState | null {
    return this.engine;
  }
}

function syncNumbers(
  target: {
    length: number;
    push(...n: number[]): number;
    splice(start: number, count?: number): unknown;
    [i: number]: number | undefined;
  },
  source: readonly number[],
) {
  if (target.length === source.length && source.every((v, i) => target[i] === v)) return;
  target.splice(0, target.length);
  if (source.length) target.push(...source);
}
