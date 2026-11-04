import { listen } from '@colyseus/tools';
import server from './app.config.js';
import { env } from './config/env.js';
import { configureMatchStore } from './services/configureStore.js';
import { logger } from './services/logger.js';

// A stray rejected promise (e.g. a failed persistence write) is logged rather
// than crashing every live match on this process.
process.on('unhandledRejection', (reason) => {
  logger.error({ reason: String(reason) }, 'unhandled promise rejection');
});
// Colyseus registers its own handler that shuts the server down gracefully
// (exit code 1 in production); this one only adds a structured log line.
process.on('uncaughtException', (error) => {
  logger.error({ error: error.stack ?? String(error) }, 'uncaught exception');
});

const config = env();
await configureMatchStore();
await listen(server, config.PORT);
logger.info({ port: config.PORT, env: config.NODE_ENV }, 'Ludo 3D game server listening');
