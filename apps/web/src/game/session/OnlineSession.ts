'use client';

import type { Room } from '@colyseus/sdk';
import {
  CLASSIC_INDIAN_DIGITAL,
  getRuleProfile,
  isSeatIndex,
  type GameEvent,
  type GameState,
  type PieceId,
  type SeatIndex,
} from '@ludo3d/shared';
import {
  CLIENT_MESSAGES,
  SERVER_MESSAGES,
  fromSynced,
  type ActionResultMessage,
  type GameEventsMessage,
  type NoticeMessage,
  type SyncedGame,
} from '@ludo3d/shared/protocol';
import type {
  ConnectionStatus,
  GameSession,
  SeatInfo,
  SessionSnapshot,
  SessionUpdate,
} from './types';

/** Shape of the synchronised room state as decoded by the SDK. */
export interface SyncedPlayer {
  sessionId: string;
  seat: number;
  name: string;
  ready: boolean;
  connected: boolean;
  isHost: boolean;
  timeouts: number;
}

export interface SyncedRoomState {
  phase: 'lobby' | 'playing' | 'finished';
  code: string;
  mode: 'quick' | 'private';
  playerCount: number;
  ruleProfileId: string;
  themeId: string;
  startsAt: number;
  players: Map<string, SyncedPlayer> & {
    forEach(cb: (p: SyncedPlayer, key: string) => void): void;
  };
  game?: SyncedGame;
}

export function roomState(room: Room): SyncedRoomState | undefined {
  return room.state as SyncedRoomState | undefined;
}

export function playersOf(room: Room): SyncedPlayer[] {
  const list: SyncedPlayer[] = [];
  roomState(room)?.players?.forEach((p) => list.push(p));
  return list;
}

const newActionId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

/**
 * A match on the authoritative game server. Server events arrive as messages
 * immediately; the schema patch with the matching state version can arrive a
 * little later. Events are therefore buffered until the state that contains
 * them has been received, then handed to the UI together. Version gaps (e.g.
 * after reconnecting) are delivered as a resync without animation.
 */
export class OnlineSession implements GameSession {
  readonly kind = 'online' as const;
  private snapshot: SessionSnapshot;
  private readonly listeners = new Set<(u: SessionUpdate) => void>();
  private readonly noticeListeners = new Set<(n: NoticeMessage) => void>();
  private readonly statusListeners = new Set<(s: ConnectionStatus) => void>();
  private pendingEvents: GameEventsMessage[] = [];
  private deliveredVersion: number;
  private inFlight: { actionId: string; version: number } | null = null;
  private unbind: (() => void)[] = [];
  status: ConnectionStatus = 'connected';

  constructor(private readonly room: Room) {
    const state = this.readGame();
    if (!state) throw new Error('match state not available yet');
    this.snapshot = { state, seats: this.readSeats() };
    this.deliveredVersion = state.version;

    this.unbind.push(
      room.onMessage(SERVER_MESSAGES.gameEvents, (message: GameEventsMessage) => {
        this.pendingEvents.push(message);
        this.flush();
      }),
      room.onMessage(SERVER_MESSAGES.actionResult, (result: ActionResultMessage) => {
        if (this.inFlight?.actionId === result.actionId && !result.ok) this.inFlight = null;
      }),
      room.onMessage(SERVER_MESSAGES.notice, (notice: NoticeMessage) => {
        for (const l of this.noticeListeners) l(notice);
      }),
    );
    const onState = () => this.flush();
    room.onStateChange(onState);
    this.unbind.push(() => room.onStateChange.remove(onState));
    const onDrop = () => this.setStatus('reconnecting');
    const onReconnect = () => {
      this.setStatus('connected');
      this.flush(true);
    };
    const onLeave = () => this.setStatus('disconnected');
    room.onDrop(onDrop);
    room.onReconnect(onReconnect);
    room.onLeave(onLeave);
    this.unbind.push(
      () => room.onDrop.remove(onDrop),
      () => room.onReconnect.remove(onReconnect),
      () => room.onLeave.remove(onLeave),
    );
  }

  get roomId() {
    return this.room.roomId;
  }

  get localSeat(): SeatIndex | null {
    const seat = roomState(this.room)?.players?.get(this.room.sessionId)?.seat;
    return isSeatIndex(seat) ? seat : null;
  }

  private readGame(): GameState | null {
    const synced = roomState(this.room);
    if (!synced?.game) return null;
    const rules = getRuleProfile(synced.ruleProfileId) ?? CLASSIC_INDIAN_DIGITAL;
    return fromSynced(synced.game, rules);
  }

  private readSeats(): SeatInfo[] {
    return playersOf(this.room)
      .filter((p) => isSeatIndex(p.seat))
      .map((p) => ({
        seat: p.seat as SeatIndex,
        name: p.name,
        controller: 'remote' as const,
        isLocal: p.sessionId === this.room.sessionId,
        connected: p.connected,
      }));
  }

  /** Delivers buffered events whose state has arrived (or a resync on gaps). */
  private flush(forceResync = false) {
    const state = this.readGame();
    if (!state) return;
    const seats = this.readSeats();
    const ready = this.pendingEvents
      .filter((m) => m.version <= state.version)
      .sort((a, b) => a.version - b.version);
    this.pendingEvents = this.pendingEvents.filter((m) => m.version > state.version);
    const fresh = ready.filter((m) => m.version > this.deliveredVersion);

    const seatsChanged = JSON.stringify(seats) !== JSON.stringify(this.snapshot.seats);
    if (!forceResync && state.version === this.deliveredVersion && fresh.length === 0) {
      if (seatsChanged) this.emit({ snapshot: { state, seats }, events: [] });
      return;
    }
    if (this.inFlight && state.version > this.inFlight.version) this.inFlight = null;

    // Contiguous events → animate. Missing versions (reconnect) → resync.
    const expected = this.deliveredVersion;
    const contiguous =
      !forceResync &&
      fresh.length > 0 &&
      fresh.every((m, i) => m.version === expected + i + 1) &&
      fresh[fresh.length - 1]!.version === state.version;
    const events: GameEvent[] = contiguous ? fresh.flatMap((m) => [...m.events]) : [];
    this.deliveredVersion = state.version;
    this.emit({ snapshot: { state, seats }, events, resync: !contiguous });
  }

  private emit(update: SessionUpdate) {
    this.snapshot = update.snapshot;
    for (const l of this.listeners) l(update);
  }

  private setStatus(status: ConnectionStatus) {
    this.status = status;
    for (const l of this.statusListeners) l(status);
  }

  getSnapshot() {
    return this.snapshot;
  }

  subscribe(listener: (u: SessionUpdate) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onNotice(listener: (n: NoticeMessage) => void) {
    this.noticeListeners.add(listener);
    return () => this.noticeListeners.delete(listener);
  }

  onStatus(listener: (s: ConnectionStatus) => void) {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  private send(type: 'roll' | 'move', payload: Record<string, unknown>) {
    const version = this.snapshot.state.version;
    // One command per state version: double taps cannot send twice.
    if (this.inFlight?.version === version) return;
    const actionId = newActionId();
    this.inFlight = { actionId, version };
    this.room.send(CLIENT_MESSAGES[type], { actionId, expectedVersion: version, ...payload });
  }

  roll(seat: SeatIndex) {
    if (seat !== this.localSeat) return;
    this.send('roll', {});
  }

  move(seat: SeatIndex, pieceId: PieceId) {
    if (seat !== this.localSeat) return;
    this.send('move', { pieceId });
  }

  resign() {
    this.room.send(CLIENT_MESSAGES.resign, { actionId: newActionId() });
  }

  notifyPresentationIdle() {
    // The server paces the match (turn timers); nothing to do locally.
  }

  dispose() {
    for (const u of this.unbind) u();
    this.unbind = [];
    this.listeners.clear();
    this.noticeListeners.clear();
    this.statusListeners.clear();
  }
}
