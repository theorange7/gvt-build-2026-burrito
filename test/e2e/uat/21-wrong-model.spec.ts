import { test, expect } from '@playwright/test';
import { clearStorage, setupPassphrase, seedDemoData, stubBackend } from './helpers';

const PASS = 'correct horse battery staple';

test.describe('UAT-021 — wrong-model fallback', () => {
  test('stub: enqueue with default modelId completes (stub accepts any payload)', async ({ page }) => {
    const { wrapRequests } = await stubBackend(page);
    await page.goto('/dashboard');
    await clearStorage(page);
    await page.goto('/dashboard');
    await setupPassphrase(page, PASS);
    await seedDemoData(page);

    await page.getByRole('button', { name: /wrap it/i }).click();
    await page.getByRole('button', { name: /^generate$/i }).click();
    await expect(page.getByRole('link', { name: /view status/i })).toBeVisible({ timeout: 30_000 });

    expect(wrapRequests.length).toBeGreaterThan(0);
    expect(wrapRequests[0].modelId).toBeDefined();
  });

  test.describe('full-stack: unknown modelId silently maps to default', () => {
    test.skip(!process.env.UAT_FULL, 'set UAT_FULL=1 to run against a real backend');

    test('POST /wrap with nonexistent modelId returns 200', async ({ page }) => {
      await page.goto('/dashboard');
      await clearStorage(page);
      await page.goto('/dashboard');
      await setupPassphrase(page, PASS);
      await page.getByRole('button', { name: /start fresh/i }).click();

      const result = await page.evaluate(async () => {
        const reg = await fetch('http://localhost:7071/api/auth/register', { method: 'POST' });
        const { token } = (await reg.json()) as { token: string };
        const res = await fetch('http://localhost:7071/api/wrap', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
          body: JSON.stringify({
            jobId: crypto.randomUUID(),
            contributions: [],
            mode: 'snapshot',
            windowStart: '2025-01-01T00:00:00.000Z',
            windowEnd: '2025-12-31T23:59:59.999Z',
            modelId: 'nonexistent:model-9000',
          }),
        });
        return { status: res.status, body: (await res.json()) as Record<string, unknown> };
      });

      expect(result.status).toBe(200);
      expect(result.body.status).toBe('queued');
    });
  });
});
