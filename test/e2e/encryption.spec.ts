import { test, expect } from '@playwright/test';

test.describe('encrypted-at-rest in IndexedDB', () => {
  test.beforeEach(async ({ page }) => {
    // Bypass the invite gate: per-session DB is named 'wrapped-for-work-e2e-session'.
    await page.addInitScript(() => {
      localStorage.setItem('burrito:session', 'e2e-session');
    });
  });

  test('contribution signals are not stored as plaintext strings', async ({ page }) => {
    await page.goto('/dashboard');
    // Bypass invite-code gate: set a fixed session so the app opens the
    // per-session DB ('wrapped-for-work-test') and skips the invite form.
    await page.evaluate(() => localStorage.setItem('burrito:session', 'test'));
    await page.goto('/dashboard');
    const fields = page.getByPlaceholder(/passphrase/i);
    await fields.nth(0).fill('encryption-test-passphrase');
    await fields.nth(1).fill('encryption-test-passphrase');
    await page.getByRole('button', { name: /set passphrase/i }).click();
    await page.getByRole('button', { name: /try with demo data/i }).click();
    await expect(page.getByText(/contributions caught/i)).toBeVisible({ timeout: 15_000 });

    const rawRow = await page.evaluate(async () => {
      const open = indexedDB.open('wrapped-for-work-test');
      const db: IDBDatabase = await new Promise((resolve, reject) => {
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(open.error);
      });
      const tx = db.transaction('contributions', 'readonly');
      const store = tx.objectStore('contributions');
      const all: unknown[] = await new Promise((resolve, reject) => {
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      return all[0];
    });

    expect(rawRow).toBeDefined();
    const row = rawRow as Record<string, unknown>;
    expect(row.signal, 'plaintext signal field must not exist on the row').toBeUndefined();
    expect(row.iv).toBeDefined();
    expect(row.ct).toBeDefined();
  });
});
