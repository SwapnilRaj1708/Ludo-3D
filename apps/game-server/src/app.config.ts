import { defineRoom, defineServer } from '@colyseus/core';
import { configureHttp } from './http/routes.js';
import { LudoRoom } from './rooms/LudoRoom.js';

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
