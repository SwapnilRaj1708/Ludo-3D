import { defineConfig, devices } from '@playwright/test';

/**
 * By default tests run against a production build (`build:e2e`, port 3100):
 * no hot reload, production React, and test hooks compiled in. Set E2E_DEV=1
 * to reuse a running `next dev` (NEXT_PUBLIC_E2E=1) on port 3000 instead.
 */
const DEV = process.env.E2E_DEV === '1';
const PORT = DEV ? 3000 : 3100;

/**
 * Browser tests run against `next dev` with NEXT_PUBLIC_E2E=1 (exposes
 * read-only state hooks and deterministic scenarios). WebGL runs on
 * SwiftShader in headless CI, so tests use low quality and accelerated
 * animation where frame rate does not matter.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 180_000,
  expect: { timeout: 60_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  outputDir: 'test-results',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    launchOptions: {
      args: [
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
        '--ignore-gpu-blocklist',
      ],
    },
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, grep: /@mobile/ },
  ],
  webServer: {
    command: DEV ? 'pnpm dev' : 'pnpm build:e2e && pnpm start:e2e',
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 420_000,
    env: { NEXT_PUBLIC_E2E: '1' },
  },
});
