/**
 * Build-time public configuration. Values are inlined by Next.js from
 * NEXT_PUBLIC_* variables (see .env.example). Features whose backing service
 * is not configured are shown as unavailable rather than faked.
 */
export const publicConfig = {
  gameServerUrl: process.env.NEXT_PUBLIC_GAME_SERVER_URL?.replace(/\/$/, '') || null,
  firebase: process.env.NEXT_PUBLIC_FIREBASE_API_KEY
    ? {
        apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
        authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? '',
        appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? '',
      }
    : null,
  firebaseEmulators: process.env.NEXT_PUBLIC_FIREBASE_EMULATORS === '1',
  /** Exposes read-only test hooks on window for Playwright. */
  e2e: process.env.NEXT_PUBLIC_E2E === '1',
} as const;

export const isOnlineConfigured = () => publicConfig.gameServerUrl !== null;
