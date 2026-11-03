import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'game-server',
    environment: 'node',
    include: ['test/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Room tests share one in-process server; run files sequentially.
    fileParallelism: false,
  },
});
