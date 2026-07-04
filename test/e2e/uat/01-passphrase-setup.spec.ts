import { test, expect } from '@playwright/test';
import { clearStorage } from './helpers';

const PASS = 'correct horse battery staple';

test.describe('UAT-001 — passphrase setup', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard');
    await clearStorage(page);
    await page.goto('/dashboard');
  });

  test('first launch shows setup form', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /create your passphrase/i })).toBeVisible();
    await expect(page.getByTestId('protected')).toHaveCount(0);
  });

  test('short passphrase shows validation error', async ({ page }) => {
    await page.getByPlaceholder(/passphrase/i).nth(0).fill('pass');
    await page.getByRole('button', { name: /set passphrase/i }).click();
    await expect(page.getByText(/passphrase must be at least 8 characters/i)).toBeVisible();
  });

  test('mismatched passphrases show error', async ({ page }) => {
    const fields = page.getByPlaceholder(/passphrase/i);
    await fields.nth(0).fill(PASS);
    await fields.nth(1).fill('correct horse battery STAPLE');
    await page.getByRole('button', { name: /set passphrase/i }).click();
    await expect(page.getByText(/passphrases do not match/i)).toBeVisible();
  });

  test('correct passphrase setup unlocks dashboard', async ({ page }) => {
    const fields = page.getByPlaceholder(/passphrase/i);
    await fields.nth(0).fill(PASS);
    await fields.nth(1).fill(PASS);
    await page.getByRole('button', { name: /set passphrase/i }).click();
    await expect(page.getByText(/contributions caught/i)).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL('/dashboard');

    // IndexedDB: kdfSalt row exists
    const salt = await page.evaluate(async () => {
      const open = indexedDB.open('wrapped-for-work-test');
      const db: IDBDatabase = await new Promise((res, rej) => {
        open.onsuccess = () => res(open.result);
        open.onerror = () => rej(open.error);
      });
      const tx = db.transaction('meta', 'readonly');
      const store = tx.objectStore('meta');
      const row: unknown = await new Promise((res, rej) => {
        const req = store.get('kdfSalt');
        req.onsuccess = () => res(req.result);
        req.onerror = () => rej(req.error);
      });
      return row;
    });
    expect(salt).toBeDefined();
    const saltRow = salt as Record<string, unknown>;
    expect(Array.isArray(saltRow.value)).toBe(true);
    expect((saltRow.value as unknown[]).length).toBe(16);

    // No seeded flag yet
    const seeded = await page.evaluate(async () => {
      const open = indexedDB.open('wrapped-for-work-test');
      const db: IDBDatabase = await new Promise((res, rej) => {
        open.onsuccess = () => res(open.result);
        open.onerror = () => rej(open.error);
      });
      const tx = db.transaction('meta', 'readonly');
      const store = tx.objectStore('meta');
      const row: unknown = await new Promise((res, rej) => {
        const req = store.get('seeded');
        req.onsuccess = () => res(req.result);
        req.onerror = () => rej(req.error);
      });
      return row;
    });
    expect(seeded).toBeUndefined();
  });
});
