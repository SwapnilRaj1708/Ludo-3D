'use client';

import type { Firestore } from 'firebase/firestore';
import { publicConfig } from '@/services/config';
import type { SettingsValues } from '@/stores/settingsStore';
import { getFirebase } from './auth';

/**
 * Durable player data in Firestore (only when accounts are configured):
 * `users/{uid}` holds the display name, preferences and server-maintained
 * statistics; `matches/{id}` holds server-written match summaries. Security
 * rules (infra/firebase/firestore.rules) restrict each user to their own data.
 */
export type Preferences = Omit<SettingsValues, 'displayName'> & { locale?: string };

export interface ProfileDoc {
  displayName?: string;
  preferences?: Partial<Preferences>;
  stats?: { gamesPlayed?: number; wins?: number; captures?: number };
}

export interface MatchDoc {
  matchId: string;
  endedAt: number;
  mode: string;
  winnerSeat: number | null;
  players: {
    seat: number;
    name: string;
    uid: string | null;
    rank: number;
    captures: number;
    left: boolean;
  }[];
}

let db: Promise<Firestore | null> | null = null;

export function getDb(): Promise<Firestore | null> {
  db ??= (async () => {
    const fb = await getFirebase();
    if (!fb) return null;
    const { getFirestore, connectFirestoreEmulator } = await import('firebase/firestore');
    const firestore = getFirestore(fb.app);
    if (publicConfig.firebaseEmulators) connectFirestoreEmulator(firestore, '127.0.0.1', 8080);
    return firestore;
  })();
  return db;
}

export async function fetchProfile(uid: string): Promise<ProfileDoc | null> {
  const firestore = await getDb();
  if (!firestore) return null;
  const { doc, getDoc } = await import('firebase/firestore');
  const snap = await getDoc(doc(firestore, 'users', uid));
  return snap.exists() ? (snap.data() as ProfileDoc) : null;
}

export async function saveProfile(
  uid: string,
  patch: { displayName?: string; preferences?: Partial<Preferences> },
) {
  const firestore = await getDb();
  if (!firestore) return;
  const { doc, serverTimestamp, setDoc } = await import('firebase/firestore');
  await setDoc(
    doc(firestore, 'users', uid),
    { ...patch, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

export async function fetchRecentMatches(uid: string, count = 10): Promise<MatchDoc[]> {
  const firestore = await getDb();
  if (!firestore) return [];
  const { collection, getDocs, limit, orderBy, query, where } = await import('firebase/firestore');
  const snap = await getDocs(
    query(
      collection(firestore, 'matches'),
      where('playerUids', 'array-contains', uid),
      orderBy('endedAt', 'desc'),
      limit(count),
    ),
  );
  return snap.docs.map((d) => d.data() as MatchDoc);
}
