import { test, expect } from '@playwright/test';
import { clearStorage, setupPassphrase, seedDemoData, stubBackend } from './helpers';

const PASS = 'correct horse battery staple';

test.describe('UAT-009 — model switching', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard');
    await clearStorage(page);
    await page.goto('/dashboard');
  });

  test('model dropdown lists all configured options', async ({ page }) => {
    await stubBackend(page);
    await setupPassphrase(page, PASS);
    await seedDemoData(page);

    await page.getByRole('button', { name: /wrap it/i }).click();
    // Open the model select
    const modelSelect = page.getByRole('combobox');
    await expect(modelSelect).toBeVisible();
    // Check options
    const options = await modelSelect.locator('option').allTextContents();
    expect(options.some((o) => /claude-haiku/i.test(o))).toBe(true);
    expect(options.some((o) => /gpt-5\.5/i.test(o))).toBe(true);
    expect(options.some((o) => /claude sonnet 4/i.test(o))).toBe(true);
  });

  test('selecting Claude Sonnet sends correct modelId in payload', async ({ page }) => {
    const { wrapRequests } = await stubBackend(page);
    await setupPassphrase(page, PASS);
    await seedDemoData(page);

    await page.getByRole('button', { name: /wrap it/i }).click();
    const modelSelect = page.getByRole('combobox');
    await modelSelect.selectOption({ label: 'Claude Sonnet 4 (Anthropic direct)' });
    await page.getByRole('button', { name: /^generate$/i }).click();
    await expect(page.getByRole('link', { name: /view status/i })).toBeVisible({ timeout: 30_000 });

    expect(wrapRequests.length).toBeGreaterThan(0);
    expect(wrapRequests[0].modelId).toBe('anthropic:claude-sonnet-4');
  });
});
