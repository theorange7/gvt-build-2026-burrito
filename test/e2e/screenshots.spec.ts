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
const BACKEND = 'http://localhost:7071/api';

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

/**
 * Spec 50 — stubs the backend endpoints the file-upload flow touches so
 * the screenshot tests can run without a live Functions instance.
 *
 *   POST /auth/register → returns a stable test install token
 *   POST /import        → returns three pre-cooked normalized contributions
 *                         and one rejected row, mirroring what a real
 *                         extraction would shape. Optional `delayMs` lets
 *                         screenshots capture the in-flight state of the
 *                         pending-imports list before the row pops.
 */
async function mockFileUploadBackend(page: Page, opts: { delayMs?: number } = {}) {
  const delay = opts.delayMs ?? 0;
  await page.route(`${BACKEND}/auth/register`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        token: 'screenshot-install-token',
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      }),
    });
  });
  await page.route(`${BACKEND}/import`, async (route) => {
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        contributions: [
          {
            source: 'github',
            category: 'delivery',
            signal: 'Shipped login redesign (PR #42)',
            rawData: { pr: 42 },
            occurredAt: recentISO(10),
            weight: 4,
            externalId: 'gh:42',
          },
          {
            source: 'github',
            category: 'collaboration',
            signal: 'Reviewed payments PR (PR #43)',
            rawData: {},
            occurredAt: recentISO(7),
            weight: 2,
            externalId: 'gh:43',
          },
          {
            source: 'manual',
            category: 'delivery',
            signal: 'Wrote runbook for incident-response',
            rawData: {},
            occurredAt: recentISO(3),
            weight: 3,
            externalId: 'rb:001',
          },
        ],
        rejectedRows: 1,
      }),
    });
  });
}

async function submitImport(page: Page, label: string, fileName = 'commits.txt') {
  await page.getByRole('button', { name: /^import from file$/i }).click();
  await page.getByPlaceholder(/work laptop/i).fill(label);
  await page.getByRole('button', { name: 'next →' }).click();
  await page.setInputFiles('input[type="file"]', {
    name: fileName,
    mimeType: 'text/plain',
    buffer: Buffer.from(`commits dump labelled ${label}`),
  });
  await page.getByRole('button', { name: /upload and extract/i }).click();
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
  test.beforeEach(async ({ page }) => {
    // Bypass the invite gate: per-session DB is named 'wrapped-for-work-e2e-session'.
    // addInitScript fires before every page.goto() in the test, including inside unlock/reUnlock.
    await page.addInitScript(() => {
      localStorage.setItem('burrito:session', 'e2e-session');
    });
  });

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

  // ---------------------------------------------------------------------
  // Spec 50 — file-upload provider screenshots
  // ---------------------------------------------------------------------

  test('10 — timeline sidebar showing the Import-from-file button next to Manual input', async ({ page }) => {
    await unlock(page);
    // The two buttons live side-by-side under the wrap CTA on the timeline.
    await expect(page.getByRole('button', { name: /^import from file$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /add manually/i })).toBeVisible();
    await shot(page, '10-timeline-action-buttons');
  });

  test('11 — import modal step 1 (label the batch), opened from the timeline', async ({ page }) => {
    await unlock(page);
    await page.getByRole('button', { name: /^import from file$/i }).click();
    await expect(page.getByRole('heading', { name: /import from a file/i })).toBeVisible();
    await page.getByPlaceholder(/work laptop/i).fill('Q1 commits from work laptop');
    await shot(page, '11-import-step1-label');
  });

  test('12 — import modal step 2 (file + model + egress disclosure)', async ({ page }) => {
    await mockFileUploadBackend(page);
    await unlock(page);
    await page.getByRole('button', { name: /^import from file$/i }).click();
    await page.getByPlaceholder(/work laptop/i).fill('Q1 commits from work laptop');
    await page.getByRole('button', { name: 'next →' }).click();

    // The disclosure copy, the 3-parallel callout, and the model picker
    // should all be visible.
    await expect(page.getByTestId('egress-disclosure')).toBeVisible();
    await expect(page.getByTestId('egress-provider')).toBeVisible();
    await expect(page.getByText(/up to 3 imports run in parallel/i)).toBeVisible();

    await page.setInputFiles('input[type="file"]', {
      name: 'q1-commits.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from(
        [
          '2026-02-01  Shipped login redesign (PR #42)',
          '2026-02-03  Reviewed payments PR (PR #43)',
          '2026-02-05  Wrote runbook for incident-response',
        ].join('\n'),
      ),
    });
    await shot(page, '12-import-step2-disclosure');
  });

  test('13 — pending import row appears in the timeline sidebar', async ({ page }) => {
    // Slow the /import response down so the row stays visible long enough
    // to capture before it auto-pops on completion.
    await mockFileUploadBackend(page, { delayMs: 3000 });
    await unlock(page);
    await submitImport(page, 'Q1 commits from work laptop');

    const row = page.getByTestId('pending-import-row');
    await expect(row).toBeVisible();
    await expect(row).toHaveAttribute('data-status', /queued|running/);
    await expect(row).toContainText('Q1 commits from work laptop');
    await shot(page, '13-timeline-pending-import');
  });

  test('14 — concurrency cap: 3 running + 1 queued in the sidebar', async ({ page }) => {
    // Slow uploads so all four are still in flight when we screenshot.
    await mockFileUploadBackend(page, { delayMs: 4000 });
    await unlock(page);

    await submitImport(page, 'Batch one');
    await submitImport(page, 'Batch two');
    await submitImport(page, 'Batch three');
    await submitImport(page, 'Batch four');

    const rows = page.getByTestId('pending-import-row');
    await expect(rows).toHaveCount(4);

    // Exactly 3 should be running; the fourth waits in the queue.
    await expect(rows.filter({ has: page.locator('[data-status="running"]') })).toHaveCount(0);
    // Use the attribute selector directly — Playwright doesn't drill into
    // attributes via `filter`, so re-query.
    await expect(page.locator('[data-testid="pending-import-row"][data-status="running"]')).toHaveCount(3);
    await expect(page.locator('[data-testid="pending-import-row"][data-status="queued"]')).toHaveCount(1);

    await shot(page, '14-timeline-concurrency-cap');
  });

  // ---------------------------------------------------------------------
  // Wrap status + wrapped tab screenshots
  // ---------------------------------------------------------------------

  test('15 — wrap status viewer, pending state', async ({ page }) => {
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
    await shot(page, '15-wrap-status-pending');
  });

  test('16 — wrapped tab, populated', async ({ page }) => {
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
    await shot(page, '16-wrapped-tab-populated');
  });
});
