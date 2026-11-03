import type { MatchStore, MatchSummary } from './matchStore.js';

/**
 * Persists completed-match summaries and per-player statistics to Firestore
 * using the Admin SDK (bypasses security rules; never exposed to clients).
 * Only finished matches are written — live match state stays in Colyseus.
 */
export class FirestoreMatchStore implements MatchStore {
  readonly kind = 'firestore';

  private constructor(
    private readonly db: import('firebase-admin/firestore').Firestore,
    private readonly fieldValue: typeof import('firebase-admin/firestore').FieldValue,
  ) {}

  static async create(): Promise<FirestoreMatchStore> {
    const app = await import('firebase-admin/app');
    const firestore = await import('firebase-admin/firestore');
    const instance =
      app.getApps()[0] ?? app.initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID });
    return new FirestoreMatchStore(firestore.getFirestore(instance), firestore.FieldValue);
  }

  async save(summary: MatchSummary): Promise<void> {
    const { db, fieldValue } = this;
    const batch = db.batch();
    const playerUids = summary.players.map((p) => p.uid).filter((uid): uid is string => !!uid);
    batch.set(db.collection('matches').doc(summary.matchId), {
      ...summary,
      playerUids,
      createdAt: fieldValue.serverTimestamp(),
    });
    for (const player of summary.players) {
      if (!player.uid) continue;
      batch.set(
        db.collection('users').doc(player.uid),
        {
          stats: {
            gamesPlayed: fieldValue.increment(1),
            wins: fieldValue.increment(player.rank === 1 && !player.left ? 1 : 0),
            captures: fieldValue.increment(player.captures),
          },
          updatedAt: fieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }
    await batch.commit();
  }
}
