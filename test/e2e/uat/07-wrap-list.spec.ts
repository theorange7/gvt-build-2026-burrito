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
    await expect(page.getByRole('link', { name: /view status/i })).toBeVisible({ timeout: 30_000 });

    // Go to dashboard wrapped tab
    await page.goto('/dashboard');
    await page.getByRole('button', { name: /wrapped/i }).click();
    // At least one wrap card should be visible (pill SNAPSHOT or YEAR-END)
    await expect(page.getByText(/snapshot/i).or(page.getByText(/year.end/i))).toBeVisible({ timeout: 10_000 });
  });
});
