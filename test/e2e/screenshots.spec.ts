/**
 * Visual regression / documentation screenshots.
 *
 * Captures deterministic PNGs of the key UI states so reviewers and
 * designers can see the app without running it themselves. Output goes
 * to `screenshots/` (gitignored locally; uploaded as a CI artifact in
 * .github/workflows/ci.yml).
 *
 * Each test is self-contained — Playwright gives every test a fresh
 * browser context, so unlock + (where needed) provider setup are
 * repeated. That makes the spec robust to reorderings and parallel
 * execution at the cost of a few extra seconds per test.
 *
 * GitLab is mocked the same way `gitlab-provider.spec.ts` does it, so
 * no real network egress happens.
 */
import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const PASSPHRASE = 'screenshot-passphrase';
const PAT = 'glpat-screenshot-fixture-token';
const INSTANCE = 'https://gitlab.test.example.com';

const USER = {
  id: 4242,
  username: 'alice',
  name: 'Alice Example',
  email: 'alice@example.com',
};

function recentISO(daysAgo: number, hour = 10): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
}

const FIXTURE_EVENTS = [
  {
    id: 9001,
    project_id: 1,
    action_name: 'pushed to',
    target_type: null,
    created_at: recentISO(8),
    push_data: {
      commit_count: 3,
      action: 'pushed',
      ref_type: 'branch',
      commit_title: 'Add rate limiting middleware',
      ref: 'main',
    },
    author: { id: 4242, username: 'alice', name: 'Alice Example' },
  },
  {
    id: 9002,
    project_id: 1,
    action_name: 'accepted',
    target_type: 'MergeRequest',
    target_iid: 12,
    target_title: 'Migrate auth to OAuth2',
    created_at: recentISO(5),
    author: { id: 4242, username: 'alice', name: 'Alice Example' },
  },
  {
    id: 9003,
    project_id: 1,
    action_name: 'commented on',
    target_type: 'Note',
    target_iid: 7,
    target_title: 'Re: Index strategy for jobs table',
    created_at: recentISO(4),
    note: {
      id: 7777,
      body: 'Verified — the partial index covers our hot path.',
      noteable_type: 'MergeRequest',
      noteable_iid: 7,
    },
    author: { id: 4242, username: 'alice', name: 'Alice Example' },
  },
  {
    id: 9004,
    project_id: 2,
    action_name: 'opened',
    target_type: 'Issue',
    target_iid: 42,
    target_title: 'Investigate p99 latency on /search',
    created_at: recentISO(2),
    author: { id: 4242, username: 'alice', name: 'Alice Example' },
  },
];

const SCREENSHOT_DIR = path.join(process.cwd(), 'screenshots');

const WRAP_API_BASE = 'http://localhost:7071/api';

const SAMPLE_SLICES = [
  {
    sliceKey: 'identity',
    headline: 'A builder with a bias for shipping.',
    body: 'You moved between systems work and code review with measured pace.',
    stat: '134 contributions',
    supporting: null,
  },
];

async function mockWrapBackend(
  page: Page,
  opts: { pollResponse: 'running' | 'complete' },
) {
  await page.route(`${WRAP_API_BASE}/auth/register`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        token: 'screenshot-fixture-token',
        expiresAt: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
      }),
    });
  });

  await page.route(`${WRAP_API_BASE}/wrap`, async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    const body = JSON.parse(route.request().postData() ?? '{}') as { jobId: string };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ jobId: body.jobId, status: 'queued', busy: false }),
    });
  });

  await page.route(/\/api\/wrap\/[^/]+$/, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    if (opts.pollResponse === 'running') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'running', busy: false }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'complete', sliceContent: SAMPLE_SLICES }),
    });
  });
}

async function reUnlock(page: Page) {
  await page.goto('/dashboard');
  await expect(
    page.getByRole('heading', { name: /welcome back|create your passphrase/i }),
  ).toBeVisible();
  const isReturning = await page
    .getByRole('heading', { name: /welcome back/i })
    .isVisible();
  if (isReturning) {
    await page.getByPlaceholder(/passphrase/i).fill(PASSPHRASE);
    await page.getByRole('button', { name: /^unlock$/i }).click();
  } else {
    const fields = page.getByPlaceholder(/passphrase/i);
    await fields.nth(0).fill(PASSPHRASE);
    await fields.nth(1).fill(PASSPHRASE);
    await page.getByRole('button', { name: /set passphrase/i }).click();
  }
  await expect(page.getByText(/contributions caught/i)).toBeVisible();
}

async function triggerGenerate(page: Page) {
  await page.getByRole('button', { name: /WRAP IT/i }).first().click();
  await expect(page.getByRole('heading', { name: /pick the lens for this story/i })).toBeVisible();
  await page.getByRole('button', { name: /^generate$/i }).click();
  await expect(page.getByRole('link', { name: /view status/i })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('link', { name: /view status/i }).click();
}

async function shot(page: Page, name: string, fullPage = true): Promise<string> {
  await mkdir(SCREENSHOT_DIR, { recursive: true });
  const file = path.join(SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage });
  return file;
}

async function mockGitLab(page: Page) {
  await page.route(`${INSTANCE}/api/v4/user`, async (route) => {
    if (route.request().headers()['authorization'] !== `Bearer ${PAT}`) {
      await route.fulfill({ status: 401, body: JSON.stringify({ message: '401' }) });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'X-OAuth-Scopes': 'read_api,read_user' },
      body: JSON.stringify(USER),
    });
  });
  await page.route(/\/api\/v4\/users\/\d+\/events(?:\?|$)/, async (route) => {
    if (route.request().headers()['authorization'] !== `Bearer ${PAT}`) {
      await route.fulfill({ status: 401, body: JSON.stringify({ message: '401' }) });
      return;
    }
    const url = new URL(route.request().url());
    const pageNumber = Number(url.searchParams.get('page') ?? '1');
    if (pageNumber === 1) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(FIXTURE_EVENTS),
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
  });
}

async function unlock(page: Page) {
  await page.goto('/dashboard');
  const fields = page.getByPlaceholder(/passphrase/i);
  await fields.nth(0).fill(PASSPHRASE);
  await fields.nth(1).fill(PASSPHRASE);
  await page.getByRole('button', { name: /set passphrase/i }).click();
  await expect(page.getByText(/contributions caught/i)).toBeVisible();
}

async function goToSettings(page: Page) {
  await page.getByRole('button', { name: /^settings$/i }).click();
  await expect(page.getByRole('heading', { name: /connect your tools/i })).toBeVisible();
  await page.getByRole('button', { name: /GitLab Dedicated/i }).click();
}

test.use({ viewport: { width: 1440, height: 900 } });

test.describe('UI screenshots', () => {
  test('01 — passphrase setup gate', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: /create your passphrase/i })).toBeVisible();
    await shot(page, '01-setup-passphrase');
  });

  test('02 — dashboard, first-launch chrome', async ({ page }) => {
    await unlock(page);
    await expect(page.getByText(/Start fresh or load demo data/i)).toBeVisible();
    await shot(page, '02-dashboard-first-launch');
  });

  test('03 — dashboard with demo data loaded', async ({ page }) => {
    await unlock(page);
    await page.getByRole('button', { name: /try with demo data/i }).click();
    // Wait for the seed mutation to finish — button text returns to neutral.
    await expect(page.getByRole('button', { name: /try with demo data/i })).toHaveCount(0, {
      timeout: 30_000,
    });
    await expect(page.getByText(/active weeks/)).toBeVisible();
    await shot(page, '03-dashboard-with-demo-data');
  });

  test('04 — provider settings, empty state', async ({ page }) => {
    await unlock(page);
    await page.getByRole('button', { name: /^settings$/i }).click();
    await expect(page.getByRole('heading', { name: /connect your tools/i })).toBeVisible();
    await expect(page.getByText(/\+ LINK/)).toBeVisible();
    await shot(page, '04-settings-empty');
  });

  test('05 — provider settings, HTTPS rejection', async ({ page }) => {
    await mockGitLab(page);
    await unlock(page);
    await goToSettings(page);
    await page.getByLabel(/instance url/i).fill('http://gitlab.test.example.com');
    await page.getByLabel(/personal access token/i).fill(PAT);
    await page.getByRole('button', { name: /connect/i }).click();
    await expect(page.getByRole('alert').filter({ hasText: /HTTPS/i })).toBeVisible();
    await shot(page, '05-settings-https-error');
  });

  test('06 — provider settings, after connecting', async ({ page }) => {
    await mockGitLab(page);
    await unlock(page);
    await goToSettings(page);
    await page.getByLabel(/instance url/i).fill(INSTANCE);
    await page.getByLabel(/personal access token/i).fill(PAT);
    await page.getByRole('button', { name: /connect/i }).click();
    await expect(page.getByText(/Alice Example/)).toBeVisible({ timeout: 10_000 });
    await shot(page, '06-settings-connected');
  });

  test('07 — provider settings, after sync', async ({ page }) => {
    await mockGitLab(page);
    await unlock(page);
    await goToSettings(page);
    await page.getByLabel(/instance url/i).fill(INSTANCE);
    await page.getByLabel(/personal access token/i).fill(PAT);
    await page.getByRole('button', { name: /connect/i }).click();
    await expect(page.getByText(/Alice Example/)).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: /sync now/i }).click();
    await expect(page.getByText(/Last sync: \+\s*[1-9]\d*\s*new/i)).toBeVisible({
      timeout: 15_000,
    });
    await shot(page, '07-settings-after-sync');
  });

  test('08 — backfill range picker with coverage preview', async ({ page }) => {
    await mockGitLab(page);
    await unlock(page);
    await goToSettings(page);
    await page.getByLabel(/instance url/i).fill(INSTANCE);
    await page.getByLabel(/personal access token/i).fill(PAT);
    await page.getByRole('button', { name: /connect/i }).click();
    await expect(page.getByText(/Alice Example/)).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: /backfill range/i }).click();
    await expect(page.getByRole('heading', { name: /Backfill historical events/i })).toBeVisible();
    await expect(page.getByText(/Will fetch the uncovered window/i)).toBeVisible();
    await shot(page, '08-settings-backfill-picker');
  });

  test('09 — dashboard feed populated by GitLab sync', async ({ page }) => {
    await mockGitLab(page);
    await unlock(page);
    await goToSettings(page);
    await page.getByLabel(/instance url/i).fill(INSTANCE);
    await page.getByLabel(/personal access token/i).fill(PAT);
    await page.getByRole('button', { name: /connect/i }).click();
    await expect(page.getByText(/Alice Example/)).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: /sync now/i }).click();
    await expect(page.getByText(/Last sync: \+\s*[1-9]\d*\s*new/i)).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole('button', { name: /^timeline$/i }).click();
    await expect(page.getByText(/Migrate auth to OAuth2/i).first()).toBeVisible({ timeout: 15_000 });
    await shot(page, '09-dashboard-with-gitlab-data');
  });

  test('10 — wrap status viewer, pending state', async ({ page }) => {
    await mockWrapBackend(page, { pollResponse: 'running' });
    await unlock(page);
    await page.getByRole('button', { name: /try with demo data/i }).click();
    await expect(page.getByRole('button', { name: /try with demo data/i })).toHaveCount(0, {
      timeout: 30_000,
    });
    await triggerGenerate(page);
    await expect(page.getByRole('heading', { name: /generating your wrap/i })).toBeVisible({
      timeout: 15_000,
    });
    await shot(page, '10-wrap-status-pending');
  });

  test('11 — wrapped tab, populated', async ({ page }) => {
    await mockWrapBackend(page, { pollResponse: 'complete' });
    await unlock(page);
    await page.getByRole('button', { name: /try with demo data/i }).click();
    await expect(page.getByRole('button', { name: /try with demo data/i })).toHaveCount(0, {
      timeout: 30_000,
    });
    await triggerGenerate(page);
    // Poll completes, saves the wrap, WrapPageInner renders WrapExperience.
    // Don't need to assert on slice content — just wait long enough for save.
    await page.waitForTimeout(2_000);
    await reUnlock(page);
    await page.getByRole('button', { name: /^wrapped$/i }).click();
    await expect(page.getByRole('heading', { name: /^wrapped\.$/i })).toBeVisible();
    await expect(page.getByText(/year-end|snapshot/i).first()).toBeVisible({ timeout: 10_000 });
    await shot(page, '11-wrapped-tab-populated');
  });
});
