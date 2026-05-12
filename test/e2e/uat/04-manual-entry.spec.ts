import { test, expect } from '@playwright/test';
import { clearStorage, setupPassphrase, seedDemoData, stubBackend } from './helpers';

const PASS = 'correct horse battery staple';

test.describe('UAT-004 — manual contribution entry (client-only, stub backend)', () => {
  test.beforeEach(async ({ page }) => {
    await stubBackend(page);
    await page.goto('/dashboard');
    await clearStorage(page);
    await page.goto('/dashboard');
    await setupPassphrase(page, PASS);
    await seedDemoData(page);
  });

  test('successful classify and save shows green banner', async ({ page }) => {
    // Open the manual entry form
    await page.getByRole('button', { name: /add contribution manually/i }).click();
    await page.getByPlaceholder(/describe a contribution/i).fill(
      'Led the design review for the new payment-rail v2 migration plan.',
    );
    await page.getByRole('button', { name: 'Add Contribution', exact: true }).click();
    // With stub backend returning a valid classify response, save succeeds
    await expect(page.getByText(/contribution saved/i)).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('UAT-004 — manual contribution entry (full-stack)', () => {
  test.skip(!process.env.UAT_FULL, 'set UAT_FULL=1 to run against a real backend');

  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard');
    await clearStorage(page);
    await page.goto('/dashboard');
    await setupPassphrase(page, PASS);
    await seedDemoData(page);
  });

  test('classify hit real backend and saves', async ({ page }) => {
    await page.getByRole('button', { name: /add contribution manually/i }).click();
    await page.getByPlaceholder(/describe a contribution/i).fill(
      'Led the design review for the new payment-rail v2 migration plan.',
    );
    await page.getByRole('button', { name: 'Add Contribution', exact: true }).click();
    await expect(page.getByText(/contribution saved/i)).toBeVisible({ timeout: 15_000 });
  });
});
