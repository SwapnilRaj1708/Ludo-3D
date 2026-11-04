import type express from 'express';
import { matchMaker } from '@colyseus/core';
import { allowedOrigins, env, guestSecret } from '../config/env.js';
import { issueGuestToken } from '../authentication/guestTokens.js';
import { KeyedRateLimiter } from '../validation/rateLimiter.js';
import { matchStore } from '../services/matchStore.js';

const guestLimiter = new KeyedRateLimiter(10, 10 / 3600); // 10 burst, 10 per hour sustained

export function configureHttp(app: express.Application) {
  app.disable('x-powered-by');
  // Behind a load balancer, trust exactly the configured number of hops so
  // rate limits key on the real client address (and cannot be spoofed).
  if (env().TRUST_PROXY > 0) app.set('trust proxy', env().TRUST_PROXY);

  // CORS for our own JSON API (Colyseus handles its matchmaking routes).
  app.use('/api', (req, res, next) => {
    const origin = req.headers.origin;
    if (origin && allowedOrigins().includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Access-Control-Max-Age', '600');
    }
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  app.get('/api/health', async (_req, res) => {
    const rooms = await matchMaker.query({});
    res.json({
      ok: true,
      uptimeSeconds: Math.round(process.uptime()),
      rooms: rooms.length,
      players: rooms.reduce((sum, r) => sum + r.clients, 0),
      persistence: matchStore().kind,
    });
  });

  /** Issues a signed guest identity. Rate limited per IP. */
  app.post('/api/guest', (req, res) => {
    const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    if (!guestLimiter.take(ip)) {
      res.status(429).json({ error: 'rate_limited' });
      return;
    }
    const { token, claims } = issueGuestToken(guestSecret());
    res.setHeader('Cache-Control', 'no-store');
    res.json({ token, guestId: claims.sub, expiresAt: claims.exp * 1000 });
  });
}
