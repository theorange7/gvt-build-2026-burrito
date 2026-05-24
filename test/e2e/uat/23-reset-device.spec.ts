import { test, expect } from '@playwright/test';
import { clearStorage, setupPassphrase, seedDemoData, stubBackend } from './helpers';

const PASS = 'correct horse battery staple';

test.describe('UAT-023 — reset device (Spec 51)', () => {
  test.beforeEach(async ({ page }) => {
    await stubBackend(page);
    await page.goto('/dashboard');
    await clearStorage(page);
    await page.goto('/dashboard');
    await setupPassphrase(page, PASS);
    await seedDemoData(page);
  });

  test('"Forgot your passphrase?" link appears on the unlock screen', async ({ page }) => {
    await page.reload();
    await expect(page.getByRole('heading', { name: /welcome back/i })).toBeVisible();
    await expect(page.getByText(/forgot your passphrase/i)).toBeVisible();
  });

  test('"Forgot your passphrase?" opens reset modal', async ({ page }) => {
    await page.reload();
    await expect(page.getByRole('heading', { name: /welcome back/i })).toBeVisible();
    await page.getByText(/forgot your passphrase/i).click();
    await expect(page.getByText(/type reset to confirm/i)).toBeVisible({ timeout: 5_000 });
  });

  test('"Reset this device" button exists in settings', async ({ page }) => {
    await page.getByRole('button', { name: /^settings$/i }).click();
    await expect(page.getByRole('button', { name: /reset this device/i })).toBeVisible({ timeout: 5_000 });
  });

  test('clear-data reset with RESET confirmation clears contributions', async ({ page }) => {
    await expect(page.getByText('134', { exact: true })).toBeVisible({ timeout: 5_000 });

    await page.getByRole('button', { name: /^settings$/i }).click();
    await page.getByRole('button', { name: /reset this device/i }).click();

    // Type RESET in the confirmation input and confirm
    await page.getByPlaceholder('RESET').fill('RESET');
    await page.getByRole('button', { name: 'Reset', exact: true }).click();

    // After clear-data reset: dashboard reloads with 0 contributions
    await expect(page.getByText(/contributions caught/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('134')).toHaveCount(0, { timeout: 5_000 });
  });
});

test.describe('UAT-023 — reset device (full-stack)', () => {
  test.skip(!process.env.UAT_FULL, 'set UAT_FULL=1 to run against a real backend');

  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard');
    await clearStorage(page);
    await page.goto('/dashboard');
    await setupPassphrase(page, PASS);
    await seedDemoData(page);
  });

  test('forget-device reset returns to invite gate', async ({ page }) => {
    await page.getByRole('button', { name: /^settings$/i }).click();
    await page.getByRole('button', { name: /reset this device/i }).click();
    // Select forget-device mode
    await page.getByText(/everything above, plus/i).click();
    await page.getByPlaceholder('RESET').fill('RESET');
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    // After forget-device: session cleared → invite gate reappears
    await expect(page.getByRole('heading', { name: /enter your invite code/i })).toBeVisible({ timeout: 15_000 });
  });
});
