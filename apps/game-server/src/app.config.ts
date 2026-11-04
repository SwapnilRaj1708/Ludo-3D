import { defineRoom, defineServer, ErrorCode, matchMaker, ServerError } from '@colyseus/core';
import { verifyIdentityToken } from './authentication/verify.js';
import { allowedOrigins } from './config/env.js';
import { configureHttp } from './http/routes.js';
import { LudoRoom } from './rooms/LudoRoom.js';
import { KeyedRateLimiter } from './validation/rateLimiter.js';

/**
 * Matchmaking routes reflect any Origin by default. Restrict them to the
 * configured web origins (defence in depth — joining still requires a
 * verified identity token in onAuth).
 */
matchMaker.controller.getCorsHeaders = (headers: Headers) => {
  const origin = headers.get('origin');
  const allowed = allowedOrigins();
  return {
    'Access-Control-Allow-Origin': origin && allowed.includes(origin) ? origin : (allowed[0] ?? ''),
    Vary: 'Origin',
  };
};

/**
 * Matchmaking guard for create / join / join-by-code / quick match.
 *
 * Colyseus looks a room up before it calls `onAuth`, so a guessed room code
 * that does not exist would never reach authentication, and the client IP it
 * reports comes from forwarding headers that a client can set itself. So every
 * request must carry a valid identity token, and each identity gets a token
 * bucket (30 requests, then one every 10 s). Guest identities are themselves
 * limited per IP at `POST /api/guest`. Reconnection is authorised by its own
 * reconnection token and is not limited.
 */
export const matchmakingLimiter = new KeyedRateLimiter(30, 1 / 10);
const invokeMethod = matchMaker.controller.invokeMethod.bind(matchMaker.controller);
matchMaker.controller.invokeMethod = async (method, roomName, clientOptions, authContext) => {
  if (method !== 'reconnect') {
    const identity = await verifyIdentityToken(authContext?.token);
    if (!identity) throw new ServerError(ErrorCode.AUTH_FAILED, 'unauthorized');
    if (!matchmakingLimiter.take(identity.uid)) {
      throw new ServerError(ErrorCode.MATCHMAKE_UNHANDLED, 'too many matchmaking requests');
    }
  }
  return invokeMethod(method, roomName, clientOptions, authContext);
};

/**
 * Quick-match rooms are matched by mode and player count (filterBy);
 * private rooms are hidden from matchmaking and joined by code (room id).
 */
export const server = defineServer({
  rooms: {
    ludo: defineRoom(LudoRoom).filterBy(['mode', 'playerCount']),
  },
  express: (app) => configureHttp(app),
  greet: false,
});

export default server;
