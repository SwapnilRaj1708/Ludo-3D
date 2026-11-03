import { expect, test } from '@playwright/test';
import { getEventTypes, getState, playUntilFinished, waitForGameReady } from './helpers';

test.describe('local play', () => {
  test('starts a bots match from the menu and plays a turn @mobile', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('menu-bots').click();
    await page.getByTestId('count-2').click();
    await page.getByTestId('start-match').click();
    await waitForGameReady(page);
    const roll = page.getByTestId('roll-button');
    await expect(roll).toBeEnabled();
    await roll.click();
    await expect.poll(async () => (await getState(page)).version).toBeGreaterThan(0);
    expect(await getEventTypes(page)).toContain('dice-rolled');
  });

  test('a capture sends the victim home and grants a bonus roll', async ({ page }) => {
    await page.goto('/play/local?scenario=capture&attacker=fox&defender=horse&quality=low&speed=4');
    await waitForGameReady(page);
    await page.getByTestId('roll-button').click();
    await expect.poll(() => getEventTypes(page)).toContain('piece-captured');
    const state = await getState(page);
    expect(state.pieces.find((p) => p.id === 'red-0')?.progress).toBe(-1);
    // The capture bonus keeps the turn with the attacker.
    await expect(page.getByTestId('game-screen')).toHaveAttribute('data-phase', 'awaiting-roll');
    await expect(page.getByTestId('game-screen')).toHaveAttribute('data-turn-seat', '3');
  });

  test('winning move shows the results screen; play again restarts', async ({ page }) => {
    await page.goto('/play/local?scenario=victory&quality=low&speed=3');
    await waitForGameReady(page);
    await page.getByTestId('roll-button').click();
    await expect(page.getByTestId('results')).toBeVisible();
    await expect(page.getByTestId('winner-title')).toContainText(/win/i);
    await expect(page.getByTestId('rank-1')).toBeVisible();
    await expect(page.getByTestId('rank-2')).toBeVisible();
    await page.getByTestId('play-again').click();
    await waitForGameReady(page);
    await expect(page.getByTestId('game-screen')).toHaveAttribute('data-version', '0');
    await expect(page.getByTestId('game-screen')).toHaveAttribute('data-status', 'playing');
  });

  test('a complete bot match runs from start to victory', async ({ page }) => {
    test.setTimeout(600_000);
    await page.goto(
      '/play/local?mode=bots&autostart=1&players=2&spectate=1&speed=14&seed=11&quality=low',
    );
    await waitForGameReady(page);
    await expect(page.getByTestId('results')).toBeVisible({ timeout: 540_000 });
    const state = await getState(page);
    expect(state.status).toBe('finished');
    expect(state.rankings).toHaveLength(2);
    expect(state.pieces.filter((p) => p.progress === 56).length).toBeGreaterThanOrEqual(4);
  });

  test('a human completes a full match through the UI against a bot', async ({ page }) => {
    test.setTimeout(900_000);
    await page.goto('/play/local?mode=bots&autostart=1&players=2&speed=14&seed=5&quality=low');
    await waitForGameReady(page);
    await playUntilFinished(page, 840_000);
    await expect(page.getByTestId('results')).toBeVisible();
    await page.getByTestId('main-menu').click();
    await expect(page).toHaveURL(/\/$/);
  });

  test('pause menu can leave the match', async ({ page }) => {
    await page.goto('/play/local?mode=bots&autostart=1&players=2&quality=low');
    await waitForGameReady(page);
    await page.getByTestId('game-menu-button').click();
    await page.getByTestId('leave-button').click();
    await page.getByTestId('confirm-yes').click();
    await expect(page).toHaveURL(/\/$/);
  });
});
