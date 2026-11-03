import { listen } from '@colyseus/tools';
import server from './app.config.js';
import { env } from './config/env.js';
import { configureMatchStore } from './services/configureStore.js';
import { logger } from './services/logger.js';

const config = env();
await configureMatchStore();
await listen(server, config.PORT);
logger.info({ port: config.PORT, env: config.NODE_ENV }, 'Ludo 3D game server listening');
