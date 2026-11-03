import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Signed guest identities for players without an account (or when Firebase
 * is not configured). Format: `g1.<base64url(payload)>.<base64url(hmac)>`.
 * The server is the only party that can mint them, so a client cannot claim
 * another player's identity by sending an arbitrary id.
 */
export interface GuestClaims {
  sub: string;
  iat: number;
  exp: number;
}

const PREFIX = 'g1';
const TTL_SECONDS = 60 * 60 * 24 * 30;

const b64 = (buf: Buffer) => buf.toString('base64url');

function sign(secret: string, body: string): string {
  return b64(createHmac('sha256', secret).update(body).digest());
}

export function issueGuestToken(
  secret: string,
  now = Date.now(),
): { token: string; claims: GuestClaims } {
  const claims: GuestClaims = {
    sub: `guest_${randomBytes(12).toString('hex')}`,
    iat: Math.floor(now / 1000),
    exp: Math.floor(now / 1000) + TTL_SECONDS,
  };
  const body = `${PREFIX}.${b64(Buffer.from(JSON.stringify(claims)))}`;
  return { token: `${body}.${sign(secret, body)}`, claims };
}

export function verifyGuestToken(
  secret: string,
  token: unknown,
  now = Date.now(),
): GuestClaims | null {
  if (typeof token !== 'string' || token.length > 512) return null;
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== PREFIX) return null;
  const body = `${parts[0]}.${parts[1]}`;
  const expected = Buffer.from(sign(secret, body));
  const given = Buffer.from(parts[2]!);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const claims = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8')) as GuestClaims;
    if (typeof claims.sub !== 'string' || !/^guest_[0-9a-f]{24}$/.test(claims.sub)) return null;
    if (typeof claims.exp !== 'number' || claims.exp * 1000 < now) return null;
    return claims;
  } catch {
    return null;
  }
}
