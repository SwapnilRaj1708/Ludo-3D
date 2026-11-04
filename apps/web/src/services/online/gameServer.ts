'use client';

import { Client, type Room } from '@colyseus/sdk';
import { LUDO_ROOM_NAME, type JoinOptions } from '@ludo3d/shared/protocol';
import { publicConfig } from '@/services/config';
import { readLocal, readSession, writeLocal, writeSession } from '@/utils/storage';
import { getIdToken } from '@/services/firebase/auth';

/**
 * Connection helpers for the Colyseus game server. Identity: a Firebase ID
 * token when accounts are configured and signed in, otherwise a server-signed
 * guest token cached on the device. The server verifies either; client-side
 * ids are never trusted.
 */
export class OnlineUnavailableError extends Error {}

const GUEST_KEY = 'ludo3d.guest.v1';

interface StoredGuest {
  token: string;
  expiresAt: number;
}

let client: Client | null = null;

function serverUrl(): string {
  if (!publicConfig.gameServerUrl)
    throw new OnlineUnavailableError('Online play is not configured');
  return publicConfig.gameServerUrl;
}

export function getClient(): Client {
  client ??= new Client(serverUrl());
  return client;
}

async function guestToken(): Promise<string> {
  const raw = readLocal(GUEST_KEY);
  if (raw) {
    try {
      const stored = JSON.parse(raw) as StoredGuest;
      if (stored.token && stored.expiresAt > Date.now() + 60_000) return stored.token;
    } catch {
      /* fall through and fetch a new one */
    }
  }
  const response = await fetch(`${serverUrl()}/api/guest`, { method: 'POST' });
  if (!response.ok) throw new Error(`guest token request failed (${response.status})`);
  const body = (await response.json()) as StoredGuest & { guestId: string };
  writeLocal(GUEST_KEY, JSON.stringify({ token: body.token, expiresAt: body.expiresAt }));
  return body.token;
}

/** Ensures the SDK sends a verifiable identity with the next join. */
export async function authenticate(): Promise<void> {
  const c = getClient();
  c.auth.token = (await getIdToken()) ?? (await guestToken());
}

const reconnectKey = (code: string) => `ludo3d.reconnect.${code}`;

export function rememberRoom(room: Room) {
  writeSession(reconnectKey(room.roomId), room.reconnectionToken);
}

export function forgetRoom(code: string) {
  writeSession(reconnectKey(code), null);
  activeRooms.delete(code);
}

/** Rooms joined during this page lifetime (quick match → room page hand-off). */
const activeRooms = new Map<string, Room>();

export async function quickMatch(options: JoinOptions): Promise<Room> {
  await authenticate();
  const room = await getClient().joinOrCreate(LUDO_ROOM_NAME, { ...options, mode: 'quick' });
  activeRooms.set(room.roomId, room);
  rememberRoom(room);
  return room;
}

export async function createPrivateRoom(options: JoinOptions): Promise<Room> {
  await authenticate();
  const room = await getClient().create(LUDO_ROOM_NAME, { ...options, mode: 'private' });
  activeRooms.set(room.roomId, room);
  rememberRoom(room);
  return room;
}

/**
 * Connects to a room by code: reuses an open connection, else resumes with a
 * stored reconnection token (page refresh), else joins as a new/returning
 * player (the server restores the seat for a known identity).
 */
export async function connectToRoom(code: string, displayName: string): Promise<Room> {
  const open = activeRooms.get(code);
  if (open && open.connection?.isOpen) return open;
  await authenticate();
  const token = readSession(reconnectKey(code));
  if (token) {
    try {
      const room = await getClient().reconnect(token);
      activeRooms.set(code, room);
      rememberRoom(room);
      return room;
    } catch {
      writeSession(reconnectKey(code), null);
    }
  }
  const room = await getClient().joinById(code, { displayName });
  activeRooms.set(code, room);
  rememberRoom(room);
  return room;
}

export type JoinFailure = 'not-found' | 'full' | 'unavailable' | 'unknown';

export function classifyJoinError(error: unknown): JoinFailure {
  if (error instanceof OnlineUnavailableError) return 'unavailable';
  const message = error instanceof Error ? error.message : String(error);
  if (/not found|disposed|invalid room/i.test(message)) return 'not-found';
  if (/locked|full|already started/i.test(message)) return 'full';
  if (/fetch|network|ECONN|failed/i.test(message)) return 'unavailable';
  return 'unknown';
}
