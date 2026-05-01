import { test, expect } from '@playwright/test';

test.describe('network minimality', () => {
  test('/api/wrap payload contains no userId, id, or externalId', async ({ page }) => {
    const wrapRequests: Array<Record<string, unknown>> = [];
    await page.route('https://api.anthropic.com/v1/messages', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          content: [{ type: 'text', text: JSON.stringify({ headline: 'h', body: 'b' }) }],
        }),
      });
    });

    page.on('request', async (req) => {
      if (req.url().endsWith('/api/wrap') && req.method() === 'POST') {
        const body = req.postData();
        if (body) wrapRequests.push(JSON.parse(body));
      }
    });

    await page.goto('/dashboard');
    const fields = page.getByPlaceholder(/passphrase/i);
    await fields.nth(0).fill('network-test-passphrase');
    await fields.nth(1).fill('network-test-passphrase');
    await page.getByRole('button', { name: /set passphrase/i }).click();
    await page.getByRole('button', { name: /try with demo data/i }).click();
    await expect(page.getByText(/total signals/i)).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: /generate wrap/i }).click();
    await page.getByRole('button', { name: /^generate$/i }).click();
    await expect(page.getByRole('link', { name: /view wrap/i })).toBeVisible({ timeout: 30_000 });

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
