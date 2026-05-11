import { test, expect } from '@playwright/test';
import { clearStorage, setupPassphrase, seedDemoData } from './helpers';

const PASS = 'correct horse battery staple';
const WRONG = 'wrong horse battery staple';

test.describe('UAT-003 — lock / unlock round-trip', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard');
    await clearStorage(page);
    await page.goto('/dashboard');
    await setupPassphrase(page, PASS);
    await seedDemoData(page);
  });

  test('reload shows Welcome back unlock form', async ({ page }) => {
    await page.reload();
    await expect(page.getByRole('heading', { name: /welcome back/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /create your passphrase/i })).toHaveCount(0);
  });

  test('wrong passphrase shows error and leaves IDB unchanged', async ({ page }) => {
    await page.reload();
    await page.getByPlaceholder(/passphrase/i).fill(WRONG);
    await page.getByRole('button', { name: /unlock/i }).click();
    await expect(page.getByText(/wrong passphrase/i)).toBeVisible();

    // Data is still encrypted (not cleared)
    const count = await page.evaluate(async () => {
      const open = indexedDB.open('wrapped-for-work');
      const db: IDBDatabase = await new Promise((res, rej) => {
        open.onsuccess = () => res(open.result);
        open.onerror = () => rej(open.error);
      });
      const tx = db.transaction('contributions', 'readonly');
      const store = tx.objectStore('contributions');
      const all: unknown[] = await new Promise((res, rej) => {
        const req = store.getAll();
        req.onsuccess = () => res(req.result);
        req.onerror = () => rej(req.error);
      });
      return all.length;
    });
    expect(count).toBe(134);
  });

  test('correct passphrase after reload restores dashboard', async ({ page }) => {
    await page.reload();
    await page.getByPlaceholder(/passphrase/i).fill(PASS);
    await page.getByRole('button', { name: /unlock/i }).click();
    await expect(page.getByText('134')).toBeVisible({ timeout: 10_000 });
  });
});
