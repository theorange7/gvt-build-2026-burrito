import { test, expect } from '@playwright/test';
import { clearStorage, setupPassphrase, seedDemoData, stubBackend } from './helpers';

const PASS = 'correct horse battery staple';

test.describe('UAT-005 — wrap generation, snapshot mode', () => {
  let wrapRequests: Array<Record<string, unknown>> = [];

  test.beforeEach(async ({ page }) => {
    const stub = await stubBackend(page);
    wrapRequests = stub.wrapRequests;
    await page.goto('/dashboard');
    await clearStorage(page);
    await page.goto('/dashboard');
    await setupPassphrase(page, PASS);
    await seedDemoData(page);
  });

  test('snapshot wrap enqueues and shows View status link', async ({ page }) => {
    await page.getByRole('button', { name: /wrap it/i }).click();
    await page.getByRole('button', { name: /^generate$/i }).click();
    await expect(page.getByRole('link', { name: /view status/i })).toBeVisible({ timeout: 30_000 });
  });

  test('wrap enqueue payload has correct snapshot fields', async ({ page }) => {
    await page.getByRole('button', { name: /wrap it/i }).click();
    await page.getByRole('button', { name: /^generate$/i }).click();
    await expect(page.getByRole('link', { name: /view status/i })).toBeVisible({ timeout: 30_000 });

    expect(wrapRequests.length).toBeGreaterThan(0);
    const payload = wrapRequests[0];
    expect(payload.mode).toBe('snapshot');
    const body = JSON.stringify(payload);
    expect(body).not.toContain('"userId"');
    expect(body).not.toContain('"externalId"');
  });
});

test.describe('UAT-008 — wrap generation, year-end mode', () => {
  let wrapRequests: Array<Record<string, unknown>> = [];

  test.beforeEach(async ({ page }) => {
    const stub = await stubBackend(page);
    wrapRequests = stub.wrapRequests;
    await page.goto('/dashboard');
    await clearStorage(page);
    await page.goto('/dashboard');
    await setupPassphrase(page, PASS);
    await seedDemoData(page);
  });

  test('year-end wrap enqueues and payload has correct mode and window', async ({ page }) => {
    await page.getByRole('button', { name: /wrap it/i }).click();
    await page.getByRole('button', { name: /year.end/i }).click();
    await expect(page.getByText(/year.end automatically uses the full 2025 calendar year/i)).toBeVisible();
    await page.getByRole('button', { name: /^generate$/i }).click();
    await expect(page.getByRole('link', { name: /view status/i })).toBeVisible({ timeout: 30_000 });

    expect(wrapRequests.length).toBeGreaterThan(0);
    const payload = wrapRequests[0];
    expect(payload.mode).toBe('year-end');
    expect(String(payload.windowStart)).toContain('2025-01-01');
    expect(String(payload.windowEnd)).toContain('2025-12-31');
  });
});
