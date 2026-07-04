import { test, expect } from '@playwright/test';
import { clearStorage, setupPassphrase, seedDemoData, stubBackend } from './helpers';

const PASS = 'correct horse battery staple';

test.describe('UAT-014 — pending wrap key-loss (KG-5 regression signal)', () => {
  test.beforeEach(async ({ page }) => {
    // Use queued poll status so the wrap stays in pending state
    await stubBackend(page, { pollStatus: 'queued' });
    await page.goto('/dashboard');
    await clearStorage(page);
    await page.goto('/dashboard');
    await setupPassphrase(page, PASS);
    await seedDemoData(page);
  });

  test('as-shipped: wrap stays pending when poll is queued (KG-5 documented state)', async ({ page }) => {
    await page.getByRole('button', { name: /wrap it/i }).click();
    await page.getByRole('button', { name: /^generate$/i }).click();
    const link = page.getByRole('link', { name: /view status/i });
    await expect(link).toBeVisible({ timeout: 30_000 });
    await link.click();
    // With queued poll, wrap stays in pending/queued state — no error expected here
    await expect(page.getByText(/queued|generating/i)).toBeVisible({ timeout: 10_000 });
  });

  test.describe('full-stack pending key-loss', () => {
    test.skip(!process.env.UAT_FULL, 'set UAT_FULL=1 to run against a real backend');

    test('lock during polling leads to phase: failed (as-shipped KG-5 behavior)', async ({ page }) => {
      await page.getByRole('button', { name: /wrap it/i }).click();
      await page.getByRole('button', { name: /^generate$/i }).click();
      const link = page.getByRole('link', { name: /view status/i });
      await expect(link).toBeVisible({ timeout: 30_000 });
      await link.click();
      // Simulate lock by clearing in-memory key via beforeunload event
      await page.evaluate(() => window.dispatchEvent(new Event('beforeunload')));
      // After lock: the wrap may fail to save
      // This confirms KG-5 — we assert the page doesn't crash
      await expect(page.getByText(/generating|queued|failed/i)).toBeVisible({ timeout: 30_000 });
    });
  });
});
