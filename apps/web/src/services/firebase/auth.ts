'use client';

import type { Auth, User } from 'firebase/auth';
import type { FirebaseApp } from 'firebase/app';
import { publicConfig } from '@/services/config';

/**
 * Optional Firebase Authentication. Loaded lazily and only when configured
 * (NEXT_PUBLIC_FIREBASE_*), so the game ships no Firebase code to players
 * when accounts are disabled. Guests are signed in anonymously; Google
 * sign-in links to the anonymous account so stats are kept.
 */
interface FirebaseHandles {
  app: FirebaseApp;
  auth: Auth;
}

let handles: Promise<FirebaseHandles | null> | null = null;

export function isAccountsEnabled(): boolean {
  return publicConfig.firebase !== null;
}

export function getFirebase(): Promise<FirebaseHandles | null> {
  if (!publicConfig.firebase) return Promise.resolve(null);
  handles ??= (async () => {
    const { initializeApp, getApps } = await import('firebase/app');
    const { getAuth, connectAuthEmulator } = await import('firebase/auth');
    const app = getApps()[0] ?? initializeApp(publicConfig.firebase!);
    const auth = getAuth(app);
    if (publicConfig.firebaseEmulators) {
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    }
    await auth.authStateReady();
    return { app, auth };
  })();
  return handles;
}

/** ID token for the game server; signs in anonymously if needed. Null when accounts are off. */
export async function getIdToken(): Promise<string | null> {
  const fb = await getFirebase();
  if (!fb) return null;
  const { signInAnonymously } = await import('firebase/auth');
  const user = fb.auth.currentUser ?? (await signInAnonymously(fb.auth)).user;
  return user.getIdToken();
}

export async function signInWithGoogle(): Promise<User | null> {
  const fb = await getFirebase();
  if (!fb) return null;
  const { GoogleAuthProvider, linkWithPopup, signInWithPopup } = await import('firebase/auth');
  const provider = new GoogleAuthProvider();
  const current = fb.auth.currentUser;
  if (current?.isAnonymous) {
    try {
      return (await linkWithPopup(current, provider)).user;
    } catch (error) {
      // Google account already linked elsewhere: sign into that account instead.
      if ((error as { code?: string }).code !== 'auth/credential-already-in-use') throw error;
    }
  }
  return (await signInWithPopup(fb.auth, provider)).user;
}

export async function signOutUser(): Promise<void> {
  const fb = await getFirebase();
  if (!fb) return;
  const { signOut } = await import('firebase/auth');
  await signOut(fb.auth);
}

export async function onUserChanged(callback: (user: User | null) => void): Promise<() => void> {
  const fb = await getFirebase();
  if (!fb) {
    callback(null);
    return () => {};
  }
  const { onAuthStateChanged } = await import('firebase/auth');
  return onAuthStateChanged(fb.auth, callback);
}
