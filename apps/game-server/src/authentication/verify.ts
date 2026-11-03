import { guestSecret, env } from '../config/env.js';
import { verifyGuestToken } from './guestTokens.js';
import { verifyFirebaseToken } from './firebase.js';

export interface VerifiedIdentity {
  uid: string;
  provider: 'guest' | 'firebase';
  /** Name from the identity provider, if any (display names are chosen per room). */
  name?: string;
  /** True for Firebase accounts that are not anonymous. */
  registered: boolean;
}

/**
 * Resolves a bearer token into a verified identity: a server-signed guest
 * token, or (when Firebase is configured) a Firebase ID token verified with the
 * Admin SDK. Anything else is rejected.
 */
export async function verifyIdentityToken(token: unknown): Promise<VerifiedIdentity | null> {
  if (typeof token !== 'string' || token.length === 0) return null;
  if (token.startsWith('g1.')) {
    const claims = verifyGuestToken(guestSecret(), token);
    return claims ? { uid: claims.sub, provider: 'guest', registered: false } : null;
  }
  if (env().FIREBASE_PROJECT_ID) return verifyFirebaseToken(token);
  return null;
}
