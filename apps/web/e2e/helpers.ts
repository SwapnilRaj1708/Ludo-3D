import { expect, type Page } from '@playwright/test';

export async function waitForGameReady(page: Page) {
  await expect(page.getByTestId('game-screen')).toHaveAttribute('data-ready', '1', {
    timeout: 120_000,
  });
}

export interface GameStateLike {
  status: string;
  seats: number[];
  version: number;
  turn: { seat: number; phase: string };
  pieces: { id: string; progress: number }[];
  winner: number | null;
  rankings: number[];
}

export function getState(page: Page): Promise<GameStateLike> {
  return page.evaluate(() =>
    (window as unknown as { __LUDO__: { getState: () => GameStateLike } }).__LUDO__.getState(),
  );
}

export function getEventTypes(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    (window as unknown as { __LUDO__: { events: { type: string }[] } }).__LUDO__.events.map(
      (e) => e.type,
    ),
  );
}

/** Plays the human seat through the UI until the match ends (bots play the rest). */
export async function playUntilFinished(page: Page, maxMs: number) {
  const deadline = Date.now() + maxMs;
  const screen = page.getByTestId('game-screen');
  while (Date.now() < deadline) {
    if ((await screen.getAttribute('data-status')) === 'finished') return;
    const roll = page.getByTestId('roll-button');
    if (await roll.isEnabled().catch(() => false)) {
      await roll.click({ timeout: 2_000 }).catch(() => undefined);
      continue;
    }
    const choice = page.locator('[data-testid^="choose-"]').first();
    if (await choice.isVisible().catch(() => false)) {
      await choice.click({ timeout: 2_000 }).catch(() => undefined);
      continue;
    }
    await page.waitForTimeout(100);
  }
  throw new Error('match did not finish in time');
}
