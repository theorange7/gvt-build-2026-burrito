import { test, expect } from '@playwright/test';
import { clearStorage, setupPassphrase, stubBackend } from './helpers';

const PASS = 'correct horse battery staple';

test.describe('UAT-016 — stale wrap link', () => {
  test.beforeEach(async ({ page }) => {
    await stubBackend(page);
    await page.goto('/dashboard');
    await clearStorage(page);
    await page.goto('/dashboard');
    await setupPassphrase(page, PASS);
    await page.getByRole('button', { name: /start fresh/i }).click();
  });

  test('unknown wrap id shows not-on-device panel with back link', async ({ page }) => {
    await page.goto('/wrap?id=aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    await expect(page.getByText(/this wrap isn't on this device/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('link', { name: /back to dashboard/i })).toBeVisible();
  });

  test('no requests to /api/wrap/{id} are made for unknown wrap with no pending row', async ({ page }) => {
    const apiRequests: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/api/wrap/')) apiRequests.push(req.url());
    });

    await page.goto('/wrap?id=aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    await expect(page.getByText(/this wrap isn't on this device/i)).toBeVisible({ timeout: 10_000 });
    // No polling should have fired since there's no pending row
    expect(apiRequests.filter((u) => u.includes('aaaaaaaa'))).toHaveLength(0);
  });
});
