import { test, expect } from '@playwright/test';

const TEST_PASSPHRASE = 'e2e-passphrase-12345';

test.describe('locality — data lives only on the device', () => {
  test('first launch shows invite gate; not a server-rendered dashboard', async ({ page }) => {
    await page.goto('/dashboard');
    // First launch now shows the invite-code gate (private preview), not passphrase setup
    await expect(page.getByRole('heading', { name: /enter your invite code/i })).toBeVisible();
    await expect(page.getByTestId('protected')).toHaveCount(0);
  });

  test('clearing site data resets to first-launch state', async ({ page, context }) => {
    await page.goto('/dashboard');
    // Bypass invite gate for initial setup
    await page.evaluate(() => localStorage.setItem('burrito:session', 'test'));
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: /create your passphrase/i })).toBeVisible();

    const fields = page.getByPlaceholder(/passphrase/i);
    await fields.nth(0).fill(TEST_PASSPHRASE);
    await fields.nth(1).fill(TEST_PASSPHRASE);
    await page.getByRole('button', { name: /set passphrase/i }).click();
    await expect(page.getByText(/contributions caught/i)).toBeVisible();

    await context.clearCookies();
    await page.evaluate(async () => {
      const dbs = await indexedDB.databases?.();
      if (dbs) for (const d of dbs) if (d.name) indexedDB.deleteDatabase(d.name);
      localStorage.clear();
      sessionStorage.clear();
    });

    await page.goto('/dashboard');
    // Clearing localStorage removes the session → invite gate reappears
    await expect(page.getByRole('heading', { name: /enter your invite code/i })).toBeVisible();
  });
});
