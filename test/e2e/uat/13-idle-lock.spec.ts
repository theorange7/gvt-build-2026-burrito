import { test, expect } from '@playwright/test';
import { clearStorage, setupPassphrase, seedDemoData } from './helpers';

const PASS = 'correct horse battery staple';

test.describe('UAT-013 — idle lock', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard');
    await clearStorage(page);
    await page.goto('/dashboard');
    await setupPassphrase(page, PASS);
    await seedDemoData(page);
  });

  test('reload clears in-memory key and shows unlock form', async ({ page }) => {
    await expect(page.getByText('134')).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: /welcome back/i })).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole('heading', { name: /create your passphrase/i })).toHaveCount(0);
  });

  test('simulated visibility-hidden + reload shows unlock form', async ({ page }) => {
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.reload();
    await expect(page.getByRole('heading', { name: /welcome back/i })).toBeVisible({ timeout: 5_000 });
  });
});
