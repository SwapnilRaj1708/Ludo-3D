import { expect, test } from '@playwright/test';

test.describe('main menu', () => {
  test('renders every mode and navigates @mobile', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('img', { name: 'Ludo 3D' })).toBeVisible();
    for (const id of ['menu-online', 'menu-friends', 'menu-join', 'menu-bots', 'menu-local']) {
      await expect(page.getByTestId(id)).toBeVisible();
    }
    await page.getByTestId('menu-bots').click();
    await expect(page).toHaveURL(/\/play\/local\?mode=bots/);
    await expect(page.getByTestId('start-match')).toBeVisible();
  });

  test('switches language to Hindi and Simplified Chinese and persists it', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('language-select').selectOption('hi');
    await expect(page.getByTestId('menu-bots')).toContainText('बॉट के साथ खेलें');
    await expect(page.locator('html')).toHaveAttribute('lang', 'hi');
    await page.reload();
    await expect(page.getByTestId('menu-bots')).toContainText('बॉट के साथ खेलें');
    await page.getByTestId('language-select').selectOption('zh-CN');
    await expect(page.getByTestId('menu-bots')).toContainText('人机对战');
    await page.getByTestId('language-select').selectOption('en');
    await expect(page.getByTestId('menu-bots')).toContainText('Play with Bots');
  });

  test('settings persist across reloads', async ({ page }) => {
    await page.goto('/settings');
    const mute = page.getByTestId('setting-mute');
    await expect(mute).toHaveAttribute('aria-checked', 'false');
    await mute.click();
    await expect(mute).toHaveAttribute('aria-checked', 'true');
    await page.reload();
    await expect(page.getByTestId('setting-mute')).toHaveAttribute('aria-checked', 'true');
    await page.getByTestId('setting-mute').click();
  });

  test('how to play explains the rules', async ({ page }) => {
    await page.goto('/how-to-play');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByText(/six to move an animal out/i)).toBeVisible();
  });
});
