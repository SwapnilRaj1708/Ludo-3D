import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'firebase-rules',
    environment: 'node',
    include: ['test-firebase/**/*.test.ts'],
    testTimeout: 30_000,
  },
});
