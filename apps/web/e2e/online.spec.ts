import { expect, test, type Page } from '@playwright/test';
import { getEventTypes, getState, waitForGameReady } from './helpers';

const localSeats = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as { __LUDO__: { localSeats: () => number[] } }).__LUDO__.localSeats(),
  );

async function isMyTurn(page: Page) {
  const [state, seats] = await Promise.all([getState(page), localSeats(page)]);
  return seats.includes(state.turn.seat);
}

test.describe('online multiplayer (two independent browsers)', () => {
  test('private room: create, invite by code, ready, start, play, reload, leave', async ({
    browser,
  }) => {
    test.setTimeout(300_000);
    const hostContext = await browser.newContext();
    const guestContext = await browser.newContext();
    const host = await hostContext.newPage();
    const guest = await guestContext.newPage();

    await host.goto('/play/friends');
    await host.getByTestId('online-name').fill('Asha');
    await host.getByTestId('online-count-2').click();
    await host.getByTestId('online-go').click();
    await expect(host).toHaveURL(/\/room\/[A-Z0-9]{6}$/);
    const code = (await host.getByTestId('room-code').textContent())!.trim();

    await guest.goto('/join');
    await guest.getByTestId('room-code-input').fill(code.toLowerCase());
    await guest.getByTestId('join-submit').click();
    await expect(guest).toHaveURL(new RegExp(`/room/${code}$`));
    await guest.getByLabel(/your name/i).fill('Bilal');
    await guest.getByRole('button', { name: /join/i }).click();

    await expect(host.getByTestId('lobby-seat')).toHaveCount(2);
    await expect(guest.getByTestId('lobby-seat')).toHaveCount(2);
    await host.getByTestId('ready-toggle').click();
    await guest.getByTestId('ready-toggle').click();
    await expect(host.getByTestId('start-online')).toBeEnabled();
    await host.getByTestId('start-online').click();

    await waitForGameReady(host);
    await waitForGameReady(guest);

    // Whoever's turn it is rolls; both browsers must see the same server-generated die.
    const roller = (await isMyTurn(host)) ? host : guest;
    const other = roller === host ? guest : host;
    await expect(other.getByTestId('roll-button')).toBeDisabled();
    await roller.getByTestId('roll-button').click();
    await roller
      .getByTestId('roll-button')
      .click({ force: true })
      .catch(() => undefined); // double tap
    await expect.poll(async () => (await getState(other)).version).toBeGreaterThanOrEqual(1);
    const diceEvents = async (p: Page) =>
      p.evaluate(() =>
        (
          window as unknown as { __LUDO__: { events: { type: string; value?: number }[] } }
        ).__LUDO__.events
          .filter((e) => e.type === 'dice-rolled')
          .map((e) => e.value),
      );
    await expect.poll(() => diceEvents(other)).toHaveLength(1);
    expect(await diceEvents(roller)).toEqual(await diceEvents(other));
    expect((await getState(roller)).version).toBe((await getState(other)).version);

    // Refresh: the guest reconnects to the same seat and state.
    const guestSeats = await localSeats(guest);
    await guest.reload();
    await waitForGameReady(guest);
    expect(await localSeats(guest)).toEqual(guestSeats);
    await expect
      .poll(async () => (await getState(guest)).version)
      .toBe((await getState(host)).version);

    // The guest leaves: the host is the last player standing and wins.
    await guest.getByTestId('game-menu-button').click();
    await guest.getByTestId('leave-button').click();
    await guest.getByTestId('confirm-yes').click();
    await expect(guest).toHaveURL(/\/$/);
    await expect(host.getByTestId('results')).toBeVisible({ timeout: 60_000 });
    await expect(host.getByTestId('winner-title')).toContainText(/win/i);
    expect(await getEventTypes(host)).toContain('player-left');

    await hostContext.close();
    await guestContext.close();
  });

  test('quick match pairs two players by size and starts automatically', async ({ browser }) => {
    test.setTimeout(180_000);
    const contexts = await Promise.all([browser.newContext(), browser.newContext()]);
    const pages = await Promise.all(contexts.map((c) => c.newPage()));
    for (const [i, page] of pages.entries()) {
      await page.goto('/play/online');
      await page.getByTestId('online-name').fill(`Player ${i + 1}`);
      await page.getByTestId('online-count-2').click();
      await page.getByTestId('online-go').click();
      await expect(page).toHaveURL(/\/room\/[A-Z0-9]{6}$/);
    }
    expect(new URL(pages[0]!.url()).pathname).toBe(new URL(pages[1]!.url()).pathname);
    for (const page of pages) await waitForGameReady(page);
    const [a, b] = await Promise.all(pages.map((p) => getState(p)));
    expect(a!.seats).toEqual([0, 2]);
    expect(a!.turn.seat).toBe(b!.turn.seat);
    for (const c of contexts) await c.close();
  });
});
