import { test, expect } from '@playwright/test';
import { clearStorage, setupPassphrase } from './helpers';

const PASS = 'correct horse battery staple';

test.describe('UAT-011 — profile name persistence', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard');
    await clearStorage(page);
    await page.goto('/dashboard');
    await setupPassphrase(page, PASS);
    await page.getByRole('button', { name: /start fresh/i }).click();
  });

  test('saved name persists in greeting and avatar after reload', async ({ page }) => {
    // Go to settings
    await page.getByRole('button', { name: /settings/i }).click();
    const nameInput = page.getByPlaceholder(/your name/i).or(page.locator('input[type="text"]').first());
    await nameInput.fill('Alex Chen');
    await page.getByRole('button', { name: /save name/i }).click();
    await expect(page.getByText(/saved/i)).toBeVisible({ timeout: 5_000 });

    // Switch to timeline tab to see greeting
    await page.getByRole('button', { name: /timeline/i }).click();
    await expect(page.getByText(/hey, alex/i)).toBeVisible({ timeout: 5_000 });

    // localStorage check
    const stored = await page.evaluate(() => localStorage.getItem('burrito:profile'));
    expect(stored).toContain('Alex Chen');

    // Reload and check persistence
    await page.reload();
    await page.getByPlaceholder(/passphrase/i).fill(PASS);
    await page.getByRole('button', { name: /unlock/i }).click();
    await page.getByRole('button', { name: /timeline/i }).click();
    await expect(page.getByText(/hey, alex/i)).toBeVisible({ timeout: 10_000 });
  });
});
