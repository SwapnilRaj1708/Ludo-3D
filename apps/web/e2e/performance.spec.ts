import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { waitForGameReady } from './helpers';

/**
 * Records load-time, asset, renderer and memory metrics into
 * docs/perf/report-<project>.json. Headless CI renders WebGL on the CPU
 * (SwiftShader), so FPS here is a pessimistic lower bound, not device FPS.
 *   pnpm --filter @ludo3d/web exec playwright test e2e/performance.spec.ts --grep @perf
 */
test('performance report @perf @mobile', async ({ page }, info) => {
  test.setTimeout(240_000);
  const report: Record<string, unknown> = {
    project: info.project.name,
    date: new Date().toISOString(),
  };

  await page.goto('/');
  report.menu = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    const paint = performance.getEntriesByName('first-contentful-paint')[0];
    return {
      ttfbMs: Math.round(nav.responseStart),
      domContentLoadedMs: Math.round(nav.domContentLoadedEventEnd),
      firstContentfulPaintMs: paint ? Math.round(paint.startTime) : null,
      transferKB: Math.round(
        performance
          .getEntriesByType('resource')
          .reduce((sum, r) => sum + ((r as PerformanceResourceTiming).transferSize ?? 0), 0) / 1024,
      ),
    };
  });

  for (const quality of ['low', 'medium', 'high'] as const) {
    const start = Date.now();
    await page.goto(`/play/local?mode=bots&autostart=1&players=4&quality=${quality}`);
    await waitForGameReady(page);
    const readyMs = Date.now() - start;
    await page.waitForTimeout(6000);
    const metrics = await page.evaluate(() => {
      const w = window as unknown as {
        __LUDO_PERF__?: Record<string, number>;
        __LUDO_ASSETS__?: unknown;
      };
      const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
      return {
        renderer: w.__LUDO_PERF__ ?? null,
        assets: w.__LUDO_ASSETS__ ?? null,
        jsHeapMB: memory ? Math.round(memory.usedJSHeapSize / 1048576) : null,
      };
    });
    expect(metrics.renderer).not.toBeNull();
    report[`game-${quality}`] = { sceneReadyMs: readyMs, ...metrics };
  }

  const dir = fileURLToPath(new URL('../../../docs/perf', import.meta.url));
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    resolve(dir, `report-${info.project.name}.json`),
    `${JSON.stringify(report, null, 2)}\n`,
  );
});
