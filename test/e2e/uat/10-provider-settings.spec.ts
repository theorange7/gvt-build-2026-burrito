import { test, expect } from '@playwright/test';
import { clearStorage, setupPassphrase } from './helpers';

const PASS = 'correct horse battery staple';

test.describe('UAT-010 — provider settings', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard');
    await clearStorage(page);
    await page.goto('/dashboard');
    await setupPassphrase(page, PASS);
    await page.getByRole('button', { name: /start fresh/i }).click();
  });

  test('settings tab shows exactly one provider card (GitLab Dedicated)', async ({ page }) => {
    await page.getByRole('button', { name: /settings/i }).click();
    await expect(page.getByText(/gitlab dedicated/i)).toBeVisible({ timeout: 5_000 });
    // Only one provider link card — use role="button" filter to avoid matching
    // nested parent elements that also contain "+ LINK" in their textContent.
    const providerCards = page.getByRole('button').filter({ hasText: /\+ link/i });
    await expect(providerCards).toHaveCount(1);
  });

  test('clicking GitLab Dedicated card opens connect modal', async ({ page }) => {
    await page.getByRole('button', { name: /settings/i }).click();
    await page.getByRole('button', { name: /gitlab dedicated/i }).click();
    // Modal should be open with instance URL input
    await expect(page.getByPlaceholder(/instance url/i).or(page.getByPlaceholder(/https:\/\/gitlab/i))).toBeVisible({ timeout: 5_000 });
  });

  test('privacy banner is visible in settings', async ({ page }) => {
    await page.getByRole('button', { name: /settings/i }).click();
    await expect(page.getByText(/your data stays yours/i)).toBeVisible({ timeout: 5_000 });
  });
});
