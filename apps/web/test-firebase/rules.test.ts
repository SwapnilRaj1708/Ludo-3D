/**
 * Firestore security-rule tests. They run against the Firestore emulator
 * (`pnpm test:firebase` starts it); without it they are skipped.
 */
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  connectFirestoreEmulator,
  doc,
  getDoc,
  getFirestore,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Firestore,
} from 'firebase/firestore';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

const HOST = process.env.FIRESTORE_EMULATOR_HOST;
const PROJECT = 'demo-ludo3d';
const BASE = `http://${HOST}/v1/projects/${PROJECT}/databases/(default)/documents`;
const apps: FirebaseApp[] = [];

function dbFor(uid: string | null): Firestore {
  const app = initializeApp({ projectId: PROJECT, apiKey: 'demo' }, `app-${uid}-${apps.length}`);
  apps.push(app);
  const db = getFirestore(app);
  const [host, port] = HOST!.split(':');
  connectFirestoreEmulator(
    db,
    host!,
    Number(port),
    uid
      ? {
          mockUserToken: {
            sub: uid,
            user_id: uid,
            firebase: { sign_in_provider: 'anonymous', identities: {} },
          },
        }
      : {},
  );
  return db;
}

/** Writes as the emulator owner, bypassing rules (simulates the Admin SDK). */
async function seed(path: string, fields: Record<string, unknown>) {
  const toValue = (v: unknown): unknown =>
    Array.isArray(v)
      ? { arrayValue: { values: v.map(toValue) } }
      : typeof v === 'number'
        ? { integerValue: String(v) }
        : typeof v === 'object' && v
          ? {
              mapValue: {
                fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toValue(x)])),
              },
            }
          : { stringValue: String(v) };
  const body = {
    fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, toValue(v)])),
  };
  const res = await fetch(`${BASE}/${path}`, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`seed failed ${res.status}`);
}

describe.skipIf(!HOST)('Firestore security rules', () => {
  beforeEach(async () => {
    await fetch(`http://${HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, {
      method: 'DELETE',
    });
  });
  afterAll(async () => {
    await Promise.all(apps.map((a) => deleteApp(a)));
  });

  const validProfile = () => ({
    displayName: 'Asha',
    preferences: { musicVolume: 0.4, muted: false, quality: 'auto', locale: 'hi' },
    updatedAt: serverTimestamp(),
  });

  it('lets a player create and read only their own profile', async () => {
    const alice = dbFor('alice');
    await expect(setDoc(doc(alice, 'users/alice'), validProfile())).resolves.toBeUndefined();
    await expect(getDoc(doc(alice, 'users/alice'))).resolves.toBeTruthy();
    await expect(setDoc(doc(alice, 'users/bob'), validProfile())).rejects.toMatchObject({
      code: 'permission-denied',
    });
    await seed('users/bob', { displayName: 'Bob' });
    await expect(getDoc(doc(alice, 'users/bob'))).rejects.toMatchObject({
      code: 'permission-denied',
    });
  });

  it('never lets a client write statistics', async () => {
    const alice = dbFor('alice');
    await expect(
      setDoc(doc(alice, 'users/alice'), { ...validProfile(), stats: { wins: 999 } }),
    ).rejects.toMatchObject({ code: 'permission-denied' });
    await seed('users/alice', {
      displayName: 'Asha',
      stats: { gamesPlayed: 3, wins: 1, captures: 4 },
    });
    await expect(
      updateDoc(doc(alice, 'users/alice'), { 'stats.wins': 50, updatedAt: serverTimestamp() }),
    ).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(
      updateDoc(doc(alice, 'users/alice'), {
        'preferences.muted': true,
        updatedAt: serverTimestamp(),
      }),
    ).resolves.toBeUndefined();
  });

  it('validates profile fields', async () => {
    const alice = dbFor('alice');
    const bad = [
      { ...validProfile(), displayName: '' },
      { ...validProfile(), displayName: 'x'.repeat(41) },
      { ...validProfile(), preferences: { musicVolume: 2 } },
      { ...validProfile(), preferences: { quality: 'ultra' } },
      { ...validProfile(), preferences: { evil: true } },
      { ...validProfile(), isAdmin: true },
      { displayName: 'Asha' },
    ];
    for (const data of bad) {
      await expect(setDoc(doc(alice, 'users/alice'), data)).rejects.toMatchObject({
        code: 'permission-denied',
      });
    }
  });

  it('allows reading only matches the player took part in; never writing them', async () => {
    await seed('matches/m1', { matchId: 'm1', playerUids: ['alice', 'carol'], endedAt: 1 });
    await seed('matches/m2', { matchId: 'm2', playerUids: ['bob'], endedAt: 2 });
    const alice = dbFor('alice');
    await expect(getDoc(doc(alice, 'matches/m1'))).resolves.toBeTruthy();
    await expect(getDoc(doc(alice, 'matches/m2'))).rejects.toMatchObject({
      code: 'permission-denied',
    });
    await expect(setDoc(doc(alice, 'matches/m3'), { playerUids: ['alice'] })).rejects.toMatchObject(
      { code: 'permission-denied' },
    );
  });

  it('denies everything to signed-out clients', async () => {
    await seed('matches/m1', { matchId: 'm1', playerUids: ['alice'], endedAt: 1 });
    const anon = dbFor(null);
    await expect(getDoc(doc(anon, 'matches/m1'))).rejects.toMatchObject({
      code: 'permission-denied',
    });
    await expect(setDoc(doc(anon, 'users/alice'), validProfile())).rejects.toMatchObject({
      code: 'permission-denied',
    });
  });
});
