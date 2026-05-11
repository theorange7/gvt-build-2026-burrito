import { test, expect } from '@playwright/test';
import { clearStorage, setupPassphrase, seedDemoData } from './helpers';

const PASS = 'correct horse battery staple';

async function openIDB(page: Parameters<typeof clearStorage>[0]) {
  return page.evaluate(async () => {
    const open = indexedDB.open('wrapped-for-work');
    const db: IDBDatabase = await new Promise((res, rej) => {
      open.onsuccess = () => res(open.result);
      open.onerror = () => rej(open.error);
    });
    return db;
  });
}

test.describe('UAT-019 — encryption at rest (privacy invariant)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard');
    await clearStorage(page);
    await page.goto('/dashboard');
    await setupPassphrase(page, PASS);
    await seedDemoData(page);
  });

  test('contribution rows have iv/ct and no plaintext signal', async ({ page }) => {
    const rows = await page.evaluate(async () => {
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
      return all.slice(0, 3);
    });

    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      const r = row as Record<string, unknown>;
      expect(r.iv).toBeDefined();
      expect(r.ct).toBeDefined();
      expect(r.signal).toBeUndefined();
      expect(r.userId).toBeUndefined();
      expect(r.externalId).toBeUndefined();
      expect(r.externalUrl).toBeUndefined();
    }
  });

  test('serialized contribution rows contain no sensitive substrings', async ({ page }) => {
    const rows = await page.evaluate(async () => {
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
      // Return plaintext-only fields; exclude typed arrays (iv/ct) which can't be serialized
      return all.map((r) => {
        const row = r as Record<string, unknown>;
        const { iv: _iv, ct: _ct, ...rest } = row;
        void _iv; void _ct;
        return rest;
      });
    });

    for (const row of rows) {
      const str = JSON.stringify(row);
      expect(str).not.toContain('feature flag');
      expect(str).not.toContain('"signal"');
    }
  });
});
