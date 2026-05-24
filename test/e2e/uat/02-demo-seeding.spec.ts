import { test, expect } from '@playwright/test';
import { clearStorage, setupPassphrase } from './helpers';

const PASS = 'correct horse battery staple';

test.describe('UAT-002 — demo seeding', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard');
    await clearStorage(page);
    await page.goto('/dashboard');
    await setupPassphrase(page, PASS);
  });

  test('clicking Try with demo data loads 134 contributions', async ({ page }) => {
    await page.getByRole('button', { name: /try with demo data/i }).click();
    // Wait for the first-launch panel (which also contains "134") to go away,
    // then confirm the contributions counter shows 134.
    await page
      .getByRole('button', { name: /try with demo data/i })
      .waitFor({ state: 'hidden', timeout: 15_000 });
    await expect(page.getByText('134')).toBeVisible({ timeout: 5_000 });
  });

  test('contributions table has 134 rows after seeding', async ({ page }) => {
    await page.getByRole('button', { name: /try with demo data/i }).click();
    await page
      .getByRole('button', { name: /try with demo data/i })
      .waitFor({ state: 'hidden', timeout: 15_000 });

    const count = await page.evaluate(async () => {
      const open = indexedDB.open('wrapped-for-work-test');
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

  test('contribution rows are encrypted (iv/ct present, no plaintext signal)', async ({ page }) => {
    await page.getByRole('button', { name: /try with demo data/i }).click();
    await page
      .getByRole('button', { name: /try with demo data/i })
      .waitFor({ state: 'hidden', timeout: 15_000 });

    const row = await page.evaluate(async () => {
      const open = indexedDB.open('wrapped-for-work-test');
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
      return all[0];
    });
    const r = row as Record<string, unknown>;
    expect(r.iv).toBeDefined();
    expect(r.ct).toBeDefined();
    expect(r.signal).toBeUndefined();
    expect(r.userId).toBeUndefined();
    expect(r.externalId).toBeUndefined();
  });

  test('meta seeded flag is true after seeding', async ({ page }) => {
    await page.getByRole('button', { name: /try with demo data/i }).click();
    await page
      .getByRole('button', { name: /try with demo data/i })
      .waitFor({ state: 'hidden', timeout: 15_000 });

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
    expect((seeded as Record<string, unknown>).value).toBe(true);
  });
});
