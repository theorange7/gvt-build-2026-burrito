import { test, expect } from '@playwright/test';
import { clearStorage, setupPassphrase, seedDemoData, stubBackend } from './helpers';

const PASS = 'correct horse battery staple';

test.describe('UAT-007 — wrap list (Wrapped tab)', () => {
  test('empty state shows NO WRAPS YET copy', async ({ page }) => {
    await page.goto('/dashboard');
    await clearStorage(page);
    await page.goto('/dashboard');
    await setupPassphrase(page, PASS);
    // Don't seed; click Start fresh
    await page.getByRole('button', { name: /start fresh/i }).click();

    // Click wrapped tab
    await page.getByRole('button', { name: /wrapped/i }).click();
    await expect(page.getByText(/no wraps yet/i)).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/generate your first wrap/i)).toBeVisible();
  });

  test('wrapped tab shows wrap cards after a wrap completes', async ({ page }) => {
    await stubBackend(page);
    await page.goto('/dashboard');
    await clearStorage(page);
    await page.goto('/dashboard');
    await setupPassphrase(page, PASS);
    await seedDemoData(page);

    await page.getByRole('button', { name: /wrap it/i }).click();
    await page.getByRole('button', { name: /^generate$/i }).click();
    const link = page.getByRole('link', { name: /view status/i });
    await expect(link).toBeVisible({ timeout: 30_000 });
    // SPA navigation to wrap page — no beforeunload, key stays live.
    // Polling runs here and saves the completed wrap to IDB.
    await link.click();
    await page.waitForTimeout(3000);

    // Full navigation back to dashboard — beforeunload clears in-memory key.
    await page.goto('/dashboard');
    const field = page.getByPlaceholder(/passphrase/i);
    if (await field.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await field.fill(PASS);
      await page.getByRole('button', { name: /unlock/i }).click();
      await page.getByText(/contributions caught/i).waitFor({ timeout: 10_000 });
    }

    await page.getByRole('button', { name: /wrapped/i }).click();
    // At least one wrap card should be visible (pill SNAPSHOT or YEAR-END)
    await expect(page.getByText(/snapshot/i).or(page.getByText(/year.end/i))).toBeVisible({ timeout: 10_000 });
  });
});
