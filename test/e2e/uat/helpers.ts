import type { Page } from '@playwright/test';

const BACKEND = 'http://localhost:7071/api';

const STUB_SLICE_CONTENT = [
  { sliceKey: 'launches_shipped', headline: 'Stub headline', body: 'Stub body for launches_shipped.' },
  { sliceKey: 'velocity', headline: 'Stub headline', body: 'Stub body for velocity.' },
  { sliceKey: 'cross_team_impact', headline: 'Stub headline', body: 'Stub body for cross_team_impact.' },
  { sliceKey: 'deep_work_streak', headline: 'Stub headline', body: 'Stub body for deep_work_streak.' },
  { sliceKey: 'mentorship', headline: 'Stub headline', body: 'Stub body for mentorship.' },
  { sliceKey: 'initiative', headline: 'Stub headline', body: 'Stub body for initiative.' },
  { sliceKey: 'collaboration_style', headline: 'Stub headline', body: 'Stub body for collaboration_style.' },
  { sliceKey: 'consistency', headline: 'Stub headline', body: 'Stub body for consistency.' },
  { sliceKey: 'highlight_reel', headline: 'Stub headline', body: 'Stub body for highlight_reel.' },
  { sliceKey: 'identity', headline: 'Stub headline', body: 'Stub body for identity.' },
];

export async function clearStorage(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const dbs = await indexedDB.databases?.();
    if (dbs) for (const d of dbs) if (d.name) indexedDB.deleteDatabase(d.name);
    localStorage.clear();
    sessionStorage.clear();
  });
}

export async function setupPassphrase(page: Page, pass: string): Promise<void> {
  const fields = page.getByPlaceholder(/passphrase/i);
  await fields.nth(0).fill(pass);
  await fields.nth(1).fill(pass);
  await page.getByRole('button', { name: /set passphrase/i }).click();
  await page.getByText(/contributions caught/i).waitFor({ timeout: 15_000 });
}

export async function unlockWithPassphrase(page: Page, pass: string): Promise<void> {
  const field = page.getByPlaceholder(/passphrase/i);
  await field.fill(pass);
  await page.getByRole('button', { name: /unlock/i }).click();
  await page.getByText(/contributions caught/i).waitFor({ timeout: 15_000 });
}

export async function seedDemoData(page: Page): Promise<void> {
  await page.getByRole('button', { name: /try with demo data/i }).click();
  // Wait for the button (inside the first-launch panel) to disappear — signals seeding complete.
  // Don't use getByText('134') here: the first-launch panel itself contains "134 mocked
  // contributions." before seeding starts, causing a false-positive premature match.
  await page
    .getByRole('button', { name: /try with demo data/i })
    .waitFor({ state: 'hidden', timeout: 15_000 });
}

export async function stubBackend(
  page: Page,
  opts?: { pollStatus?: 'queued' | 'running' | 'complete' | 'failed' },
): Promise<{ wrapRequests: Array<Record<string, unknown>> }> {
  const pollStatus = opts?.pollStatus ?? 'complete';
  const wrapRequests: Array<Record<string, unknown>> = [];

  await page.route(`${BACKEND}/auth/register`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        token: 'test-token',
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      }),
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
      body: JSON.stringify({ jobId: parsed.jobId ?? 'stub-job-id', status: 'queued', busy: false }),
    });
  });

  await page.route(`${BACKEND}/wrap/**`, async (route) => {
    if (route.request().method() !== 'GET') { await route.continue(); return; }
    if (pollStatus === 'complete') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'complete', sliceContent: STUB_SLICE_CONTENT }),
      });
    } else if (pollStatus === 'failed') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'failed', error: 'stub-failure' }),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: pollStatus, busy: false }),
      });
    }
  });

  await page.route(`${BACKEND}/classify`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ signal: 'Test contribution', category: 'delivery', weight: 3 }),
    });
  });

  return { wrapRequests };
}
