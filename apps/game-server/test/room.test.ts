import { boot, type ColyseusTestServer } from '@colyseus/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { isValidRoomCode } from '@ludo3d/shared/protocol';
import server from '../src/app.config.js';
import { setEnvForTests } from '../src/config/env.js';
import { MemoryMatchStore, setMatchStore } from '../src/services/matchStore.js';
import type { LudoRoom } from '../src/rooms/LudoRoom.js';
import {
  TEST_PORT,
  act,
  actionId,
  gameOf,
  mySeat,
  newClient,
  playerCountIn,
  track,
  until,
  type Player,
} from './helpers.js';

let colyseus: ColyseusTestServer;
let store: MemoryMatchStore;

beforeAll(async () => {
  setEnvForTests({ TURN_SECONDS: 20, ANIMATION_ALLOWANCE_MS: 0, RECONNECT_GRACE_SECONDS: 10 });
  colyseus = await boot(server, TEST_PORT);
});

afterAll(async () => {
  await colyseus.shutdown();
});

beforeEach(async () => {
  await colyseus.cleanup();
  store = new MemoryMatchStore();
  setMatchStore(store);
});

async function privateRoomWith(
  n: 1 | 2 | 3 | 4,
  playerCount: 2 | 3 | 4 = Math.max(2, n) as 2 | 3 | 4,
): Promise<Player[]> {
  const a = newClient();
  const hostRoom = await a.client.create('ludo', {
    mode: 'private',
    playerCount,
    displayName: 'Host',
  });
  const players = [track(a.client, a.token, hostRoom)];
  for (let i = 1; i < n; i++) {
    const c = newClient();
    const room = await c.client.joinById(hostRoom.roomId, { displayName: `P${i + 1}` });
    players.push(track(c.client, c.token, room));
  }
  await until(() => players.every((p) => playerCountIn(p.room) === n), 10_000, 'lobby sync');
  return players;
}

async function startPrivate(players: Player[]) {
  for (const p of players) p.room.send('ready', { ready: true });
  await until(() =>
    [
      ...(players[0]!.room.state as { players: Map<string, { ready: boolean }> }).players.values(),
    ].every((p) => p.ready),
  );
  players[0]!.room.send('start');
  await until(() => players.every((p) => gameOf(p.room) !== null), 10_000, 'game start');
}

function currentPlayer(players: Player[]): Player {
  const state = gameOf(players[0]!.room)!;
  return players.find((p) => mySeat(p.room) === state.turn.seat)!;
}

describe('private rooms and lobby', () => {
  it('uses a short unambiguous room code as the room id', async () => {
    const [host] = await privateRoomWith(1, 2);
    expect(isValidRoomCode(host!.room.roomId)).toBe(true);
    expect((host!.room.state as { code: string }).code).toBe(host!.room.roomId);
    expect(mySeat(host!.room)).toBe(0);
    await host!.room.leave();
  });

  it('assigns opposite seats for two players and waits for the host to start', async () => {
    const players = await privateRoomWith(2, 4);
    expect(players.map((p) => mySeat(p.room)).sort()).toEqual([0, 2]);
    players[1]!.room.send('start'); // not the host: ignored
    await new Promise((r) => setTimeout(r, 200));
    expect(gameOf(players[0]!.room)).toBeNull();
    await startPrivate(players);
    const state = gameOf(players[0]!.room)!;
    expect(state.seats).toEqual([0, 2]);
    expect([0, 2]).toContain(state.turn.seat);
  });

  it('rejects joining a room whose match already started', async () => {
    const players = await privateRoomWith(2);
    await startPrivate(players);
    const late = newClient();
    await expect(
      late.client.joinById(players[0]!.room.roomId, { displayName: 'Late' }),
    ).rejects.toThrow();
  });

  it('refuses connections without a valid identity token', async () => {
    const [host] = await privateRoomWith(1, 2);
    const forged = newClient('g1.eyJzdWIiOiJndWVzdF8wMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAifQ.bad');
    await expect(
      forged.client.joinById(host!.room.roomId, { displayName: 'Mallory' }),
    ).rejects.toThrow();
  });

  it('matches quick-play clients by player count and starts automatically', async () => {
    const a = newClient();
    const b = newClient();
    const c = newClient();
    const ra = await a.client.joinOrCreate('ludo', {
      mode: 'quick',
      playerCount: 2,
      displayName: 'A',
    });
    const rc = await c.client.joinOrCreate('ludo', {
      mode: 'quick',
      playerCount: 3,
      displayName: 'C',
    });
    const rb = await b.client.joinOrCreate('ludo', {
      mode: 'quick',
      playerCount: 2,
      displayName: 'B',
    });
    expect(rb.roomId).toBe(ra.roomId);
    expect(rc.roomId).not.toBe(ra.roomId);
    await until(() => gameOf(ra) !== null && gameOf(rb) !== null, 10_000, 'quick start');
    expect(gameOf(rc)).toBeNull();
  });
});

describe('server authority', () => {
  it('generates dice on the server and every client sees identical events', async () => {
    const players = await privateRoomWith(2);
    await startPrivate(players);
    const mover = currentPlayer(players);
    mover.room.send('roll', { actionId: actionId(), expectedVersion: 0, value: 6 } as never);
    await until(() =>
      players.every((p) => p.events.some((e) => e.events.some((x) => x.type === 'dice-rolled'))),
    );
    const rolled = (p: Player) =>
      p.events.flatMap((e) => e.events).find((x) => x.type === 'dice-rolled') as { value: number };
    expect(rolled(players[0]!).value).toBe(rolled(players[1]!).value);
    expect(mover.results.at(-1)).toMatchObject({ ok: true });
  });

  it('rejects out-of-turn, duplicate, stale and malformed commands', async () => {
    const players = await privateRoomWith(2);
    await startPrivate(players);
    const mover = currentPlayer(players);
    const other = players.find((p) => p !== mover)!;

    other.room.send('roll', { actionId: 'other-roll-001', expectedVersion: 0 });
    await until(() => other.results.length > 0);
    expect(other.results.at(-1)).toMatchObject({
      ok: false,
      reason: 'engine-rejected',
      detail: 'not-your-turn',
    });

    mover.room.send('roll', { actionId: 'dup-roll-0001', expectedVersion: 0 });
    mover.room.send('roll', { actionId: 'dup-roll-0001', expectedVersion: 0 });
    await until(() => mover.results.length >= 2);
    expect(mover.results.map((r) => r.ok)).toEqual([true, false]);
    expect(mover.results[1]).toMatchObject({ reason: 'duplicate' });

    const anyPlayer = players[0]!;
    anyPlayer.room.send('move', {
      actionId: 'stale-move-01',
      expectedVersion: 0,
      pieceId: 'yellow-0',
    });
    await until(() => anyPlayer.results.some((r) => r.actionId === 'stale-move-01'));
    expect(anyPlayer.results.find((r) => r.actionId === 'stale-move-01')).toMatchObject({
      reason: 'stale',
    });

    anyPlayer.room.send('move', {
      actionId: 'bad-move-0001',
      expectedVersion: 1,
      pieceId: '../../etc',
    });
    anyPlayer.room.send('roll', { nope: true });
    await until(() => anyPlayer.results.filter((r) => r.reason === 'invalid-payload').length >= 2);
    expect(gameOf(anyPlayer.room)!.version).toBe(1);
  });

  it('plays a timed-out turn for the absent player', async () => {
    setEnvForTests({ TURN_SECONDS: 1 });
    try {
      const players = await privateRoomWith(2);
      await startPrivate(players);
      await until(() => (gameOf(players[0]!.room)?.version ?? 0) >= 1, 6_000, 'server auto-roll');
      expect(players[0]!.notices.some((n) => n.kind === 'turn-timeout')).toBe(true);
    } finally {
      setEnvForTests({ TURN_SECONDS: 20 });
    }
  });
});

describe('connections', () => {
  it('lets a player reconnect after a page reload and keep their seat', async () => {
    const players = await privateRoomWith(2);
    await startPrivate(players);
    const [a, b] = players as [Player, Player];
    const seat = mySeat(b.room);
    const token = b.room.reconnectionToken;
    b.room.reconnection.enabled = false;
    b.room.connection.close();
    await until(() => a.notices.some((n) => n.kind === 'player-dropped'), 5_000, 'drop notice');
    const fresh = newClient(b.token);
    const back = await fresh.client.reconnect(token);
    await until(() => mySeat(back) === seat, 5_000, 'seat restored');
    await until(
      () => a.notices.some((n) => n.kind === 'player-reconnected'),
      5_000,
      'reconnect notice',
    );
    expect(gameOf(back)!.version).toBe(gameOf(a.room)!.version);
  });

  it('hands the seat to a newer connection with the same identity', async () => {
    const players = await privateRoomWith(2);
    await startPrivate(players);
    const b = players[1]!;
    const seat = mySeat(b.room);
    let closedWith = 0;
    b.room.onLeave((code: number) => {
      closedWith = code;
    });
    const second = newClient(b.token);
    const again = await second.client.joinById(b.room.roomId, { displayName: 'P2 tab 2' });
    await until(() => mySeat(again) === seat, 5_000, 'seat transfer');
    await until(() => closedWith === 4101, 5_000, 'old session closed');
  });

  it('removes a player who leaves mid-match; the last player wins and the summary is stored', async () => {
    const players = await privateRoomWith(2);
    await startPrivate(players);
    const [a, b] = players as [Player, Player];
    await b.room.leave(true);
    await until(() => gameOf(a.room)?.status === 'finished', 5_000, 'match over');
    expect(gameOf(a.room)!.winner).toBe(mySeat(a.room));
    await until(() => store.saved.length === 1, 5_000, 'summary persisted');
    expect(store.saved[0]!.players.find((p) => p.left)).toBeTruthy();
  });
});

describe('complete online match', () => {
  it('two independent clients play a full match to the end with identical state', async () => {
    const players = await privateRoomWith(2);
    await startPrivate(players);
    const room = colyseus.getRoomById<LudoRoom>(players[0]!.room.roomId);
    room.patchRate = 10;
    const deadline = Date.now() + 140_000;
    let lastVersion = -1;
    let lastActedAt = 0;
    while (gameOf(players[0]!.room)?.status !== 'finished') {
      if (Date.now() > deadline) throw new Error('match did not finish');
      const version = gameOf(players[0]!.room)!.version;
      const synced = players.every((p) => gameOf(p.room)?.version === version);
      // Act once per version; retry if the server rejected it (e.g. rate limit).
      const retry = version === lastVersion && Date.now() - lastActedAt > 400;
      if (synced && (version !== lastVersion || retry)) {
        for (const p of players) {
          if (act(p)) {
            lastVersion = version;
            lastActedAt = Date.now();
          }
        }
      }
      await new Promise((r) => setTimeout(r, 5));
    }
    await until(() => players.every((p) => gameOf(p.room)?.status === 'finished'));
    const [s1, s2] = players.map((p) => gameOf(p.room)!);
    expect(s1).toEqual(s2);
    expect(s1!.rankings).toHaveLength(2);
    expect(room.engineState).toEqual(s1);
    await until(() => store.saved.length === 1);
    expect(store.saved[0]!.winnerSeat).toBe(s1!.winner);
  }, 150_000);
});
