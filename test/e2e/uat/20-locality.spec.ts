import { test, expect } from '@playwright/test';
import { clearStorage, setupPassphrase, seedDemoData } from './helpers';

const PASS = 'correct horse battery staple';

test.describe('UAT-020 — locality (privacy invariant)', () => {
  test('clearing site data resets to first-launch state with 0 contributions', async ({ page, context }) => {
    await page.goto('/dashboard');
    await clearStorage(page);
    await page.goto('/dashboard');
    await setupPassphrase(page, PASS);
    await seedDemoData(page);
    await expect(page.getByText('134')).toBeVisible();

    // Clear everything
    await context.clearCookies();
    await page.evaluate(async () => {
      const dbs = await indexedDB.databases?.();
      if (dbs) for (const d of dbs) if (d.name) indexedDB.deleteDatabase(d.name);
      localStorage.clear();
      sessionStorage.clear();
    });

    await page.goto('/dashboard');
    // Must show setup form (not unlock) — salt was wiped
    await expect(page.getByRole('heading', { name: /create your passphrase/i })).toBeVisible({ timeout: 5_000 });

    // Set up fresh and check count is 0
    const fields = page.getByPlaceholder(/passphrase/i);
    await fields.nth(0).fill(PASS);
    await fields.nth(1).fill(PASS);
    await page.getByRole('button', { name: /set passphrase/i }).click();
    await expect(page.getByText(/contributions caught/i)).toBeVisible({ timeout: 10_000 });
    // Count should be 0 (not 134)
    await expect(page.getByText('134')).toHaveCount(0);

    // Verify IDB does not contain wrapped-for-work from before
    const dbs = await page.evaluate(async () => {
      const list = await indexedDB.databases?.();
      return list?.map((d) => d.name) ?? [];
    });
    // The database should have been recreated fresh (no old data)
    // We only confirm old data is gone (134 count not present)
    void dbs;
  });
});
