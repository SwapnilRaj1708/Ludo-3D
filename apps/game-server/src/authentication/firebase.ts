import type { VerifiedIdentity } from './verify.js';
import { logger } from '../services/logger.js';

/**
 * Optional Firebase Admin integration. `firebase-admin` is loaded lazily and
 * only when FIREBASE_PROJECT_ID is configured, so the server runs (with guest
 * identities) without any Google credentials.
 */
type AdminAuth = {
  verifyIdToken(token: string, checkRevoked?: boolean): Promise<Record<string, unknown>>;
};

let authPromise: Promise<AdminAuth | null> | null = null;

async function adminAuth(): Promise<AdminAuth | null> {
  authPromise ??= (async () => {
    try {
      const appMod = (await import('firebase-admin/app')) as typeof import('firebase-admin/app');
      const authMod = (await import('firebase-admin/auth')) as typeof import('firebase-admin/auth');
      const app =
        appMod.getApps()[0] ?? appMod.initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID });
      return authMod.getAuth(app) as unknown as AdminAuth;
    } catch (error) {
      logger.error(
        { error: String(error) },
        'firebase-admin unavailable; Firebase tokens will be rejected',
      );
      return null;
    }
  })();
  return authPromise;
}

export async function verifyFirebaseToken(token: string): Promise<VerifiedIdentity | null> {
  const auth = await adminAuth();
  if (!auth) return null;
  try {
    const decoded = await auth.verifyIdToken(token);
    const provider = (decoded.firebase as { sign_in_provider?: string } | undefined)
      ?.sign_in_provider;
    return {
      uid: String(decoded.uid),
      provider: 'firebase',
      name: typeof decoded.name === 'string' ? decoded.name : undefined,
      registered: provider !== 'anonymous',
    };
  } catch {
    return null;
  }
}
