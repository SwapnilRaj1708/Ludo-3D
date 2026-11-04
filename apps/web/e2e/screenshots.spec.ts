import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { getEventTypes, waitForGameReady } from './helpers';

/**
 * Captures the screenshots referenced in docs/PROGRESS.md from the real,
 * rendered application. Run on demand:
 *   pnpm --filter @ludo3d/web exec playwright test e2e/screenshots.spec.ts --grep @screenshots
 */
const OUT = fileURLToPath(new URL('../../../docs/screenshots', import.meta.url));
mkdirSync(OUT, { recursive: true });

async function shot(page: Page, name: string) {
  await page.screenshot({ path: resolve(OUT, `${name}.png`) });
}

test.describe('documentation screenshots @screenshots @mobile', () => {
  test.setTimeout(240_000);

  test('main menu', async ({ page }, info) => {
    await page.goto('/');
    await expect(page.getByTestId('menu-bots')).toBeVisible();
    await page.waitForTimeout(800);
    await shot(page, `menu-${info.project.name}`);
  });

  test('full board and active turn', async ({ page }, info) => {
    await page.goto('/play/local?mode=bots&autostart=1&players=4&quality=high');
    await waitForGameReady(page);
    await page.waitForTimeout(2500);
    await shot(page, `board-${info.project.name}`);
  });

  test('choosing between animals', async ({ page }, info) => {
    // Seeded so the human rolls a six with several animals able to move.
    await page.goto('/play/local?mode=local&autostart=1&players=4&seed=3&quality=high');
    await waitForGameReady(page);
    for (let i = 0; i < 40; i++) {
      if (
        await page
          .locator('[data-testid^="choose-"]')
          .first()
          .isVisible()
          .catch(() => false)
      )
        break;
      const roll = page.getByTestId('roll-button');
      if (await roll.isEnabled().catch(() => false)) await roll.click();
      else {
        const choice = page.locator('[data-testid^="choose-"]').first();
        if (await choice.isVisible().catch(() => false)) break;
      }
      await page.waitForTimeout(400);
    }
    await page.waitForTimeout(600);
    await shot(page, `active-turn-${info.project.name}`);
  });

  test('animal capture', async ({ page }, info) => {
    await page.goto(
      '/play/local?scenario=capture&attacker=lion&defender=peacock&quality=high&speed=0.5',
    );
    await waitForGameReady(page);
    for (let i = 0; i < 4; i++) {
      await page.evaluate(() =>
        window.dispatchEvent(new CustomEvent('ludo3d:zoom', { detail: 0.9 })),
      );
    }
    await page.waitForTimeout(1200);
    await page.getByTestId('roll-button').click();
    await expect.poll(() => getEventTypes(page)).toContain('piece-captured');
    for (let i = 1; i <= 6; i++) {
      await page.waitForTimeout(450);
      await shot(page, `capture-${info.project.name}-${i}`);
    }
  });

  test('victory screen', async ({ page }, info) => {
    await page.goto('/play/local?scenario=victory&quality=high');
    await waitForGameReady(page);
    await page.getByTestId('roll-button').click();
    await expect(page.getByTestId('results')).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(1000);
    await shot(page, `victory-${info.project.name}`);
  });

  test('online lobby', async ({ page }, info) => {
    await page.goto('/play/friends');
    await page.getByTestId('online-name').fill('Asha');
    await page.getByTestId('online-count-4').click();
    await page.getByTestId('online-go').click();
    await expect(page.getByTestId('room-code')).toBeVisible();
    await page.waitForTimeout(500);
    await shot(page, `lobby-${info.project.name}`);
  });

  test('hindi and chinese menus', async ({ page }, info) => {
    await page.goto('/');
    await page.getByTestId('language-select').selectOption('hi');
    await expect(page.getByTestId('menu-bots')).toContainText('बॉट');
    await page.waitForTimeout(600);
    await shot(page, `menu-hi-${info.project.name}`);
    await page.getByTestId('language-select').selectOption('zh-CN');
    await expect(page.getByTestId('menu-bots')).toContainText('人机');
    await page.waitForTimeout(600);
    await shot(page, `menu-zh-${info.project.name}`);
    await page.getByTestId('language-select').selectOption('en');
  });
});
