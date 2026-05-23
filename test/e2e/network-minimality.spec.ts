import { test, expect } from '@playwright/test';

const BACKEND = 'http://localhost:7071/api';

test.describe('network minimality', () => {
  test('backend /wrap payload contains no userId, id, or externalId', async ({ page }) => {
    const wrapRequests: Array<Record<string, unknown>> = [];

    // Stub the backend register + enqueue endpoints so the test does not
    // require a running Functions instance.
    await page.route(`${BACKEND}/auth/register`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ token: 'test-install-token', expiresAt: Math.floor(Date.now() / 1000) + 3600 }),
      });
    });
    await page.route(`${BACKEND}/wrap`, async (route, request) => {
      const body = request.postData();
      if (body) wrapRequests.push(JSON.parse(body));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          jobId: JSON.parse(body ?? '{}').jobId,
          status: 'queued',
          busy: false,
        }),
      });
    });

    // Bypass the invite gate before the first navigation.
    await page.addInitScript(() => {
      localStorage.setItem('burrito:session', 'e2e-session');
    });

    await page.goto('/dashboard');
    const fields = page.getByPlaceholder(/passphrase/i);
    await fields.nth(0).fill('network-test-passphrase');
    await fields.nth(1).fill('network-test-passphrase');
    await page.getByRole('button', { name: /set passphrase/i }).click();
    await page.getByRole('button', { name: /try with demo data/i }).click();
    await expect(page.getByText(/total signals/i)).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: /wrap it/i }).click();
    await page.getByRole('button', { name: /^generate$/i }).click();
    await expect(page.getByRole('link', { name: /view status/i })).toBeVisible({ timeout: 30_000 });

    expect(wrapRequests.length).toBeGreaterThan(0);
    const payload = wrapRequests[0];
    expect(JSON.stringify(payload)).not.toContain('"userId"');
    expect(JSON.stringify(payload)).not.toContain('"externalId"');
    const contributions = (payload.contributions ?? []) as Array<Record<string, unknown>>;
    for (const c of contributions) {
      expect(c.userId).toBeUndefined();
      expect(c.id).toBeUndefined();
      expect(c.externalId).toBeUndefined();
    }
  });
});
