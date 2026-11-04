import { defineRoom, defineServer, matchMaker } from '@colyseus/core';
import { allowedOrigins } from './config/env.js';
import { configureHttp } from './http/routes.js';
import { LudoRoom } from './rooms/LudoRoom.js';

/**
 * Quick-match rooms are matched by mode and player count (filterBy);
 * private rooms are hidden from matchmaking and joined by code (room id).
 */
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

export const server = defineServer({
  rooms: {
    ludo: defineRoom(LudoRoom).filterBy(['mode', 'playerCount']),
  },
  express: (app) => configureHttp(app),
  greet: false,
});

export default server;
