/**
 * Firebase integration (Auth + Firestore emulators via `pnpm test:firebase`).
 * Skipped when the emulators are not running.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setEnvForTests } from '../src/config/env.js';
import { verifyIdentityToken } from '../src/authentication/verify.js';

const AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const FIRESTORE = process.env.FIRESTORE_EMULATOR_HOST;
const PROJECT = 'demo-ludo3d';

async function anonymousIdToken(): Promise<{ idToken: string; uid: string }> {
  const res = await fetch(
    `http://${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ returnSecureToken: true }),
    },
  );
  const body = (await res.json()) as { idToken: string; localId: string };
  return { idToken: body.idToken, uid: body.localId };
}

describe.skipIf(!AUTH || !FIRESTORE)('Firebase on the game server', () => {
  beforeAll(() => {
    process.env.FIREBASE_PROJECT_ID = PROJECT;
    setEnvForTests({ FIREBASE_PROJECT_ID: PROJECT });
  });
  afterAll(() => {
    setEnvForTests({ FIREBASE_PROJECT_ID: undefined });
  });

  it('verifies a real Firebase ID token and rejects tampered ones', async () => {
    const { idToken, uid } = await anonymousIdToken();
    await expect(verifyIdentityToken(idToken)).resolves.toMatchObject({
      uid,
      provider: 'firebase',
      registered: false,
    });
    await expect(verifyIdentityToken(`${idToken.slice(0, -4)}AAAA`)).resolves.toBeNull();
    await expect(verifyIdentityToken('not-a-token')).resolves.toBeNull();
  });

  it('persists match summaries and increments player statistics', async () => {
    const { FirestoreMatchStore } = await import('../src/services/firestoreMatchStore.js');
    const store = await FirestoreMatchStore.create();
    const summary = {
      matchId: `test-${Date.now()}`,
      roomCode: 'ABC234',
      mode: 'private',
      ruleProfileId: 'classic-indian-digital',
      startedAt: Date.now() - 60_000,
      endedAt: Date.now(),
      winnerSeat: 0 as const,
      actions: 120,
      players: [
        {
          seat: 0 as const,
          name: 'Asha',
          uid: 'uid-asha',
          rank: 1,
          finishedPieces: 4,
          captures: 3,
          left: false,
        },
        {
          seat: 2 as const,
          name: 'Guest',
          uid: null,
          rank: 2,
          finishedPieces: 1,
          captures: 0,
          left: false,
        },
      ],
    };
    await store.save(summary);
    await store.save({ ...summary, matchId: `${summary.matchId}-b` });
    const { getFirestore } = await import('firebase-admin/firestore');
    const db = getFirestore();
    const match = await db.collection('matches').doc(summary.matchId).get();
    expect(match.data()?.playerUids).toEqual(['uid-asha']);
    const user = await db.collection('users').doc('uid-asha').get();
    expect(user.data()?.stats).toMatchObject({ gamesPlayed: 2, wins: 2, captures: 6 });
  });
});
