import { defineConfig } from 'vitest/config';

/** Root test runner: every package/app with a vitest.config.ts is a project. */
export default defineConfig({
  test: {
    projects: ['packages/shared', 'apps/web', 'apps/game-server'],
  },
});
