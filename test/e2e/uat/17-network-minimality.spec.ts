import { test, expect } from '@playwright/test';
import { clearStorage, setupPassphrase, seedDemoData } from './helpers';

const BACKEND = 'http://localhost:7071/api';
const PASS = 'correct horse battery staple';

test.describe('UAT-017 — network minimality (privacy invariant)', () => {
  test('POST /wrap payload omits userId, id, externalId from contributions', async ({ page }) => {
    const wrapRequests: Array<Record<string, unknown>> = [];

    await page.route(`${BACKEND}/auth/register`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ token: 'test-token', expiresAt: Math.floor(Date.now() / 1000) + 3600 }),
      });
    });
    await page.route(`${BACKEND}/wrap`, async (route, request) => {
      if (request.method() !== 'POST') { await route.continue(); return; }
      const body = request.postData();
      if (body) wrapRequests.push(JSON.parse(body) as Record<string, unknown>);
      const parsed = body ? (JSON.parse(body) as Record<string, unknown>) : {};
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ jobId: parsed.jobId ?? 'stub-id', status: 'queued', busy: false }),
      });
    });
    await page.route(`${BACKEND}/wrap/**`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'queued', busy: false }),
      });
    });

    await page.goto('/dashboard');
    await clearStorage(page);
    await page.goto('/dashboard');
    await setupPassphrase(page, PASS);
    await seedDemoData(page);

    await page.getByRole('button', { name: /wrap it/i }).click();
    await page.getByRole('button', { name: /^generate$/i }).click();
    await expect(page.getByRole('link', { name: /view status/i })).toBeVisible({ timeout: 30_000 });

    expect(wrapRequests.length).toBeGreaterThan(0);
    const payload = wrapRequests[0];
    const bodyStr = JSON.stringify(payload);
    expect(bodyStr).not.toContain('"userId"');
    expect(bodyStr).not.toContain('"externalId"');

    const contributions = (payload.contributions ?? []) as Array<Record<string, unknown>>;
    for (const c of contributions) {
      expect(c.userId).toBeUndefined();
      expect(c.id).toBeUndefined();
      expect(c.externalId).toBeUndefined();
    }
  });
});
