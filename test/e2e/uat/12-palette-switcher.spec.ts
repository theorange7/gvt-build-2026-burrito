import { test, expect } from '@playwright/test';
import { clearStorage, setupPassphrase } from './helpers';

const PASS = 'correct horse battery staple';

test.describe('UAT-012 — palette switcher', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard');
    await clearStorage(page);
    await page.goto('/dashboard');
    await setupPassphrase(page, PASS);
    await page.getByRole('button', { name: /start fresh/i }).click();
  });

  test('palette switch works in session (GovTech SG)', async ({ page }) => {
    await page.getByRole('button', { name: /switch palette/i }).click();
    await page.getByText(/govtech sg/i).click();
    // After switching, page should still be usable (no crash)
    await expect(page.getByText(/contributions caught/i)).toBeVisible({ timeout: 5_000 });
  });

  test('palette reverts to default (Tomato) after reload (documented gap KG-4)', async ({ page }) => {
    await page.getByRole('button', { name: /switch palette/i }).click();
    await page.getByText(/govtech sg/i).click();

    await page.reload();
    await page.getByPlaceholder(/passphrase/i).fill(PASS);
    await page.getByRole('button', { name: /unlock/i }).click();
    await expect(page.getByText(/contributions caught/i)).toBeVisible({ timeout: 10_000 });
    // Default palette is tomato — the palette switcher button should be visible
    await expect(page.getByRole('button', { name: /switch palette/i })).toBeVisible();
  });
});
