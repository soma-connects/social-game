import { test, expect } from '@playwright/test';

const liveUrl = process.env.BASE_URL ?? 'https://voice-party-roadmap-game-705423550266.us-central1.run.app';

test.describe('board game realtime UI', () => {
  test('host and guest see the same live room state', async ({ browser }) => {
    test.setTimeout(90_000);

    const hostContext = await browser.newContext();
    const guestContext = await browser.newContext();
    const host = await hostContext.newPage();
    const guest = await guestContext.newPage();

    try {
      await host.goto(liveUrl, { waitUntil: 'domcontentloaded' });
      await host.locator('input[placeholder="e.g. Chief Agbada, Sisi Vibe..."]').fill(`QA Host ${Date.now()}`);
      await host.getByRole('button', { name: 'CREATE NEW ROOM' }).click();
      await host.waitForURL(/\/game\/NJA-[A-Z0-9]+/);

      const roomUrl = host.url();
      await expect(host.getByText(/THE LOUNGING AREA \(1\/6 PLAYERS\)/)).toBeVisible();

      await guest.goto(roomUrl, { waitUntil: 'domcontentloaded' });
      await guest.locator('input[placeholder="e.g. Sisi Vibe, Sharp Guy…"]').fill(`QA Guest ${Date.now()}`);
      await guest.getByRole('button', { name: /JOIN AS PLAYER 2/ }).click();

      // The first assertion is the realtime contract: the host's Firestore
      // snapshot must reflect a player joining from a different browser.
      await expect(host.getByText(/THE LOUNGING AREA \(2\/6 PLAYERS\)/)).toBeVisible();
      await expect(guest.getByText(/THE LOUNGING AREA \(2\/6 PLAYERS\)/)).toBeVisible();

      await host.getByRole('button', { name: 'LAUNCH MATCH NOW' }).click();

      // The match opens on a live qualifying round. Both clients should leave
      // the lobby and expose the board peek without a refresh or navigation.
      await expect(host.getByRole('button', { name: 'PEEK AT THE BOARD' })).toBeVisible();
      await expect(guest.getByRole('button', { name: 'PEEK AT THE BOARD' })).toBeVisible();

      await guest.getByRole('button', { name: 'PEEK AT THE BOARD' }).click();
      await expect(guest.getByRole('heading', { name: /roadmap/i })).toBeVisible();
      await expect(guest.locator('main')).toContainText('Board progress');
    } finally {
      await hostContext.close();
      await guestContext.close();
    }
  });
});
