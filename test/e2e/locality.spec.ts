import { test, expect } from '@playwright/test';

const TEST_PASSPHRASE = 'e2e-passphrase-12345';

test.describe('locality — data lives only on the device', () => {
  test.beforeEach(async ({ page }) => {
    // Bypass the invite gate: per-session DB isolation keyed by localStorage.
    // addInitScript fires before every page.goto(), including after clearing storage.
    await page.addInitScript(() => {
      localStorage.setItem('burrito:session', 'e2e-session');
    });
  });

  test('first launch shows passphrase setup; not a server-rendered dashboard', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: /create your passphrase/i })).toBeVisible();
    await expect(page.getByTestId('protected')).toHaveCount(0);
  });

  test('clearing site data resets to first-launch state', async ({ page, context }) => {
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
    await expect(page.getByRole('heading', { name: /create your passphrase/i })).toBeVisible();
  });
});
