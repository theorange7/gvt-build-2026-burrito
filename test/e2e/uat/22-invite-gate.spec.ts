import { test, expect } from '@playwright/test';

const PASS = 'correct horse battery staple';
const BACKEND = 'http://localhost:7071/api';
const VALID_CODE = 'BURRITO-TEST-01';

test.describe('UAT-022 — invite-code gate (private preview)', () => {
  test.beforeEach(async ({ page }) => {
    // Reset to a clean state with NO session — so the invite gate is shown.
    await page.goto('/dashboard');
    await page.evaluate(async () => {
      const dbs = await indexedDB.databases?.();
      if (dbs) for (const d of dbs) if (d.name) indexedDB.deleteDatabase(d.name);
      localStorage.clear();
      sessionStorage.clear();
    });
  });

  test('first visit with no session shows invite-code gate', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: /enter your invite code/i })).toBeVisible();
    await expect(page.getByPlaceholder(/BURRITO-XXXX-XX/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /continue/i })).toBeVisible();
    // Protected content is not shown
    await expect(page.getByTestId('protected')).toHaveCount(0);
  });

  test('invalid invite code shows error', async ({ page }) => {
    // Stub auth/register to return 403 for any request
    await page.route(`${BACKEND}/auth/register`, async (route) => {
      await route.fulfill({ status: 403 });
    });

    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: /enter your invite code/i })).toBeVisible();
    await page.getByPlaceholder(/BURRITO-XXXX-XX/i).fill('BURRITO-0000-00');
    await page.getByRole('button', { name: /continue/i }).click();
    await expect(page.getByText(/invalid invite code/i)).toBeVisible({ timeout: 5_000 });
    // Still on invite form
    await expect(page.getByRole('heading', { name: /enter your invite code/i })).toBeVisible();
  });

  test('valid invite code proceeds to passphrase setup', async ({ page }) => {
    await page.route(`${BACKEND}/auth/register`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ token: 'test-token', expiresAt: Math.floor(Date.now() / 1000) + 3600 }),
      });
    });

    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: /enter your invite code/i })).toBeVisible();
    await page.getByPlaceholder(/BURRITO-XXXX-XX/i).fill(VALID_CODE);
    await page.getByRole('button', { name: /continue/i }).click();
    // After valid code: session is set → passphrase setup form appears
    await expect(page.getByRole('heading', { name: /create your passphrase/i })).toBeVisible({ timeout: 10_000 });
  });

  test('valid invite code + passphrase setup reaches dashboard', async ({ page }) => {
    await page.route(`${BACKEND}/auth/register`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ token: 'test-token', expiresAt: Math.floor(Date.now() / 1000) + 3600 }),
      });
    });

    await page.goto('/dashboard');
    await page.getByPlaceholder(/BURRITO-XXXX-XX/i).fill(VALID_CODE);
    await page.getByRole('button', { name: /continue/i }).click();
    await expect(page.getByRole('heading', { name: /create your passphrase/i })).toBeVisible({ timeout: 10_000 });

    const fields = page.getByPlaceholder(/passphrase/i);
    await fields.nth(0).fill(PASS);
    await fields.nth(1).fill(PASS);
    await page.getByRole('button', { name: /set passphrase/i }).click();
    await expect(page.getByText(/contributions caught/i)).toBeVisible({ timeout: 15_000 });
  });
});
