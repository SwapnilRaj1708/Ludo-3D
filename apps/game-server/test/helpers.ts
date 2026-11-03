import { Client, type Room } from '@colyseus/sdk';
import { CLASSIC_INDIAN_DIGITAL, getCurrentLegalMoves, type GameState } from '@ludo3d/shared';
import {
  fromSynced,
  type ActionResultMessage,
  type GameEventsMessage,
  type SyncedGame,
} from '@ludo3d/shared/protocol';
import { issueGuestToken } from '../src/authentication/guestTokens.js';
import { guestSecret } from '../src/config/env.js';

/**
 * @colyseus/testing 0.18.6 `boot(server, port)` ignores `port` when given a
 * defineServer() instance and always listens on its default test port.
 */
export const TEST_PORT = 2568;
export const ENDPOINT = `http://localhost:${TEST_PORT}`;

export interface Player {
  client: Client;
  token: string;
  room: Room;
  events: GameEventsMessage[];
  results: ActionResultMessage[];
  notices: { kind: string }[];
}

let counter = 0;
export const actionId = () => `test-action-${Date.now().toString(36)}-${counter++}`;

/** A browser-like client with its own verified guest identity. */
export function newClient(token = issueGuestToken(guestSecret()).token): {
  client: Client;
  token: string;
} {
  const client = new Client(ENDPOINT);
  client.auth.token = token;
  return { client, token };
}

export function track(client: Client, token: string, room: Room): Player {
  const player: Player = { client, token, room, events: [], results: [], notices: [] };
  room.onMessage('game-events', (m: GameEventsMessage) => player.events.push(m));
  room.onMessage('action-result', (m: ActionResultMessage) => player.results.push(m));
  room.onMessage('notice', (m: { kind: string }) => player.notices.push(m));
  return player;
}

export async function until(
  check: () => boolean,
  timeoutMs = 10_000,
  label = 'condition',
): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for ${label}`);
    await new Promise((r) => setTimeout(r, 15));
  }
}

export function gameOf(room: Room): GameState | null {
  const game = (room.state as { game?: SyncedGame } | undefined)?.game;
  return game ? fromSynced(game, CLASSIC_INDIAN_DIGITAL) : null;
}

export function mySeat(room: Room): number {
  return (
    (room.state as { players?: Map<string, { seat: number }> })?.players?.get(room.sessionId)
      ?.seat ?? -1
  );
}

export function playerCountIn(room: Room): number {
  return (room.state as { players?: Map<string, unknown> })?.players?.size ?? 0;
}

/** Plays one action for this player if it is their turn. Returns true if it acted. */
export function act(player: Player): boolean {
  const state = gameOf(player.room);
  if (!state || state.status !== 'playing' || state.turn.seat !== mySeat(player.room)) return false;
  if (state.turn.phase === 'awaiting-roll') {
    player.room.send('roll', { actionId: actionId(), expectedVersion: state.version });
    return true;
  }
  const moves = getCurrentLegalMoves(state);
  if (moves.length === 0) return false;
  player.room.send('move', {
    actionId: actionId(),
    expectedVersion: state.version,
    pieceId: moves[0]!.pieceId,
  });
  return true;
}
