import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(2567),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  GUEST_TOKEN_SECRET: z.string().min(16).optional(),
  FIREBASE_PROJECT_ID: z.string().optional(),
  /** Seconds a dropped player may take to reconnect before forfeiting. */
  RECONNECT_GRACE_SECONDS: z.coerce.number().int().min(5).max(600).default(45),
  /** Seconds a player has to roll or move before the server acts for them. */
  TURN_SECONDS: z.coerce.number().int().min(1).max(120).default(20),
  /**
   * Express "trust proxy" setting: number of reverse-proxy hops in front of the
   * server (0 = none). Needed so per-IP rate limits see the real client IP.
   */
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
  /** Extra turn time so clients can finish animating the previous action. */
  ANIMATION_ALLOWANCE_MS: z.coerce.number().int().min(0).max(15_000).default(4_000),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = envSchema.parse(process.env);
  if (parsed.NODE_ENV === 'production' && !parsed.GUEST_TOKEN_SECRET) {
    throw new Error('GUEST_TOKEN_SECRET must be set in production');
  }
  cached = parsed;
  return parsed;
}

/** For tests: override values without touching process.env. */
export function setEnvForTests(patch: Partial<Env>) {
  cached = { ...env(), ...patch };
}

export function guestSecret(): string {
  // A per-process random secret in development: tokens survive only until restart.
  return env().GUEST_TOKEN_SECRET ?? DEV_SECRET;
}

const DEV_SECRET = `dev-${crypto.randomUUID()}-${crypto.randomUUID()}`;

export function allowedOrigins(): string[] {
  return env()
    .CORS_ORIGINS.split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
