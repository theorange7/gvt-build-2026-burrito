/**
 * Spec 31 — Shareable highlight wheels: screenshot coverage.
 *
 * Captures the new UI affordances introduced by the share flow:
 *   - Generate Wrap modal with the Share toggle off (default).
 *   - Generate Wrap modal with the Share toggle on (reveals display name).
 *   - Dashboard Wrapped tab with Copy link / Stop sharing on the wrap card.
 *   - The standalone share-viewer bundle rendered from file:// (the artifact
 *     a recipient actually loads — no dashboard chrome, no auth).
 *
 * The wrap-generation endpoints are mocked the same way
 * `network-minimality.spec.ts` mocks them, so this spec does not need the
 * Functions runtime. The share viewer is rendered from a tmp dir holding a
 * fixture-stamped index.html alongside copies of the deploy-time
 * viewer.js + viewer.css.
 */
import { test, expect, type Page } from '@playwright/test';
import { copyFile, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const BACKEND = 'http://localhost:7071/api';
const PASSPHRASE = 'share-screenshot-passphrase';
const SCREENSHOT_DIR = path.join(process.cwd(), 'screenshots');
const SHARE_VIEWER_DIST = path.join(process.cwd(), 'share-viewer', 'dist');

const FIXTURE_SLICES = [
  {
    sliceKey: 'launches_shipped',
    headline: 'You shipped, often.',
    body: 'Twelve PRs across three repos — most landed within a day of review.',
    stat: '12 PRs',
    supporting: ['gateway', 'platform', 'docs'],
  },
  {
    sliceKey: 'collaboration_style',
    headline: 'Async by default.',
    body: 'Reviews returned within a working day, even across time zones.',
    stat: '< 24h',
  },
  {
    sliceKey: 'highlight_reel',
    headline: 'Three moments stand out.',
    body: 'The OAuth migration, the rate-limit rollout, and the search latency dive.',
  },
];

const SHARE_SLUG = 'aaaaBBBBccccDDDDeeeeFF'; // 22-char base64url fixture
const SHARE_URL = `https://stwrappedtest.blob.core.windows.net/wraps/${SHARE_SLUG}/index.html`;

async function shot(page: Page, name: string, fullPage = true): Promise<string> {
  await mkdir(SCREENSHOT_DIR, { recursive: true });
  const file = path.join(SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage });
  return file;
}

async function unlockFreshInstall(page: Page) {
  await page.goto('/dashboard');
  const fields = page.getByPlaceholder(/passphrase/i);
  await fields.nth(0).fill(PASSPHRASE);
  await fields.nth(1).fill(PASSPHRASE);
  await page.getByRole('button', { name: /set passphrase/i }).click();
  await expect(page.getByText(/contributions caught/i)).toBeVisible();
}

async function seedDemo(page: Page) {
  await page.getByRole('button', { name: /try with demo data/i }).click();
  await expect(page.getByRole('button', { name: /try with demo data/i })).toHaveCount(0, {
    timeout: 30_000,
  });
  await expect(page.getByText(/active weeks/)).toBeVisible();
}

/**
 * Stub every backend endpoint the share-on generate flow touches so the
 * spec runs without a Functions instance. The poll returns `complete` on
 * the first call with the slug + URL baked in.
 */
async function mockShareBackend(page: Page) {
  await page.route(`${BACKEND}/auth/register`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        token: 'test-install-token',
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      }),
    });
  });
  await page.route(`${BACKEND}/wrap`, async (route, request) => {
    const body = request.postData();
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
  await page.route(/\/api\/wrap\/[0-9a-f-]+$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'complete',
        sliceContent: FIXTURE_SLICES,
        shareSlug: SHARE_SLUG,
        shareUrl: SHARE_URL,
      }),
    });
  });
  await page.route(/\/api\/wrap\/share\/[A-Za-z0-9_-]+$/, async (route) => {
    await route.fulfill({ status: 204, body: '' });
  });
}

test.use({ viewport: { width: 1440, height: 900 } });

test.describe('Spec 31 — share screenshots', () => {
  test('10 — generate wrap modal, share toggle off (default)', async ({ page }) => {
    await mockShareBackend(page);
    await unlockFreshInstall(page);
    await seedDemo(page);
    await page.getByRole('button', { name: /wrap it/i }).click();
    await expect(page.getByRole('heading', { name: /pick the lens/i })).toBeVisible();
    await expect(page.getByText(/share this wrap with a public link/i)).toBeVisible();
    await shot(page, '10-share-modal-default');
  });

  test('11 — generate wrap modal, share toggle on (reveals display name)', async ({ page }) => {
    await mockShareBackend(page);
    await unlockFreshInstall(page);
    await seedDemo(page);
    await page.getByRole('button', { name: /wrap it/i }).click();
    await page.getByRole('checkbox').check();
    const nameField = page.getByPlaceholder(/wrapped for work — 2026/i);
    await expect(nameField).toBeVisible();
    await nameField.fill('Alex — Q2 retro');
    await shot(page, '11-share-modal-checked');
  });

  test('12 — dashboard wrap card surfaces Copy link / Stop sharing', async ({ page }) => {
    await mockShareBackend(page);
    await unlockFreshInstall(page);
    await seedDemo(page);

    // Drive the full real generate → poll → save flow with the share box
    // ticked so the wrap lands in IndexedDB with the share fields the card
    // reads via listWrapShares. Stay inside the SPA so the unlock key the
    // dashboard tab needs to decrypt the envelope stays in memory.
    await page.getByRole('button', { name: /wrap it/i }).click();
    await page.getByRole('checkbox').check();
    await page.getByPlaceholder(/wrapped for work — 2026/i).fill('Alex — Q2 retro');
    await page.getByRole('button', { name: /^generate$/i }).click();
    await page.getByRole('link', { name: /view status/i }).click();
    // PendingWrapView polls, saves the wrap with shareSlug/shareUrl, then
    // useLocalPendingWrap reactively returns null and the page swaps to
    // WrapViewer. Either text is fine — both prove the save completed.
    await expect(
      page.getByText(/momentum|your wrap is ready/i).first(),
    ).toBeVisible({ timeout: 30_000 });

    // SPA-back keeps the active unlock key in memory (a hard goto would
    // trigger the beforeunload handler that wipes it).
    await page.goBack();
    await expect(page.getByText(/contributions caught/i)).toBeVisible();
    await page.getByRole('button', { name: 'wrapped' }).click();
    await expect(page.getByRole('button', { name: /copy link/i })).toBeVisible({ timeout: 10_000 });
    await shot(page, '12-dashboard-wrap-card-shared');
  });

  test('13 — standalone share viewer bundle (the recipient view)', async ({ page }) => {
    // Recipients fetch the bundle directly from blob storage. Render the
    // exact deploy artifact from a tmp dir so this screenshot reflects what
    // they actually see — no dashboard chrome, no auth, no telemetry.
    const tmp = await mkdtemp(path.join(tmpdir(), 'wrap-share-viewer-'));
    const assetsDir = path.join(tmp, 'assets');
    await mkdir(assetsDir, { recursive: true });
    await copyFile(path.join(SHARE_VIEWER_DIST, 'viewer.js'), path.join(assetsDir, 'viewer.js'));
    await copyFile(path.join(SHARE_VIEWER_DIST, 'viewer.css'), path.join(assetsDir, 'viewer.css'));

    const template = await readFile(path.join(SHARE_VIEWER_DIST, 'index.template.html'), 'utf8');
    const payload = {
      title: 'Alex — Q2 retro',
      mode: 'snapshot',
      slices: FIXTURE_SLICES,
    };
    const json = JSON.stringify(payload).replace(/</g, '\\u003c');
    const indexHtml = template.replace(/\{\{WRAP_JSON\}\}/g, json);
    const indexPath = path.join(tmp, 'index.html');
    await writeFile(indexPath, indexHtml, 'utf8');

    // file:// → the ./video.mp4 HEAD probe fails silently (spec 31
    // explicitly allows this); the rest of the page mounts normally.
    await page.goto(pathToFileURL(indexPath).toString());
    await expect(page.getByRole('heading', { name: /alex.*retro/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /you shipped/i })).toBeVisible();
    await shot(page, '13-share-viewer-bundle');

    // Capture mid-deck too — click Next so reviewers see the carousel works.
    await page.getByRole('button', { name: /next/i }).click();
    await expect(page.getByRole('heading', { name: /async by default/i })).toBeVisible();
    await shot(page, '14-share-viewer-bundle-second-slide');
  });
});
