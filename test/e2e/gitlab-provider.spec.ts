import { test, expect, type Page } from '@playwright/test';

const PASSPHRASE = 'gitlab-e2e-passphrase';
const PAT = 'glpat-e2e-fixture-token';
const INSTANCE = 'https://gitlab.test.example.com';

const USER = {
  id: 4242,
  username: 'alice',
  name: 'Alice Example',
  email: 'alice@example.com',
};

function recentISO(daysAgo: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  d.setUTCHours(10, 0, 0, 0);
  return d.toISOString();
}

const EVENTS_PAGE_1 = [
  {
    id: 9001,
    project_id: 1,
    action_name: 'pushed to',
    target_type: null,
    created_at: recentISO(3),
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
    created_at: recentISO(1),
    author: { id: 4242, username: 'alice', name: 'Alice Example' },
  },
];

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
    const page_n = Number(url.searchParams.get('page') ?? '1');
    if (page_n === 1) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(EVENTS_PAGE_1),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
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
  // Open the GitLab connect form by clicking the provider card
  await page.getByRole('button', { name: /GitLab Dedicated/i }).click();
}

test.describe('GitLab provider — settings + sync flow', () => {
  test('rejects http:// instance URL inline (HTTPS-only)', async ({ page }) => {
    await mockGitLab(page);
    await unlock(page);
    await goToSettings(page);

    await page.getByLabel(/instance url/i).fill('http://gitlab.test.example.com');
    await page.getByLabel(/personal access token/i).fill(PAT);
    await page.getByRole('button', { name: /connect/i }).click();
    await expect(page.getByRole('alert').filter({ hasText: /HTTPS/i })).toBeVisible();
  });

  test('connects via PAT and renders identity in the providers list', async ({ page }) => {
    await mockGitLab(page);
    await unlock(page);
    await goToSettings(page);

    await page.getByLabel(/instance url/i).fill(INSTANCE);
    await page.getByLabel(/personal access token/i).fill(PAT);
    await page.getByRole('button', { name: /connect/i }).click();

    // Card auto-expands after connecting; identity details become visible
    await expect(page.getByText(/Alice Example/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(INSTANCE)).toBeVisible();
  });

  test('Sync now imports events; back on the dashboard the feed shows them', async ({ page }) => {
    await mockGitLab(page);
    await unlock(page);
    await goToSettings(page);

    await page.getByLabel(/instance url/i).fill(INSTANCE);
    await page.getByLabel(/personal access token/i).fill(PAT);
    await page.getByRole('button', { name: /connect/i }).click();
    await expect(page.getByText(/Alice Example/)).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: /sync now/i }).click();
    await expect(page.getByText(/Last sync: \+\s*[1-9]\d*\s*new/i)).toBeVisible({ timeout: 10_000 });

    const stored = await page.evaluate(async () => {
      const open = indexedDB.open('wrapped-for-work');
      const idb: IDBDatabase = await new Promise((resolve, reject) => {
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(open.error);
      });
      const tx = idb.transaction('contributions', 'readonly');
      const rows: unknown[] = await new Promise((resolve, reject) => {
        const req = tx.objectStore('contributions').getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      return rows.length;
    });
    expect(stored).toBeGreaterThan(0);

    await page.getByRole('button', { name: /^timeline$/i }).click();
    await expect(page.getByText(/Migrate auth to OAuth2/i).first()).toBeVisible({ timeout: 15_000 });
  });

  test('tokens and identity are encrypted at rest in IndexedDB', async ({ page }) => {
    await mockGitLab(page);
    await unlock(page);
    await goToSettings(page);
    await page.getByLabel(/instance url/i).fill(INSTANCE);
    await page.getByLabel(/personal access token/i).fill(PAT);
    await page.getByRole('button', { name: /connect/i }).click();
    await expect(page.getByText(/Alice Example/)).toBeVisible({ timeout: 10_000 });

    const opaque = await page.evaluate(async () => {
      function getAll<T>(store: IDBObjectStore): Promise<T[]> {
        return new Promise((resolve, reject) => {
          const req = store.getAll();
          req.onsuccess = () => resolve(req.result as T[]);
          req.onerror = () => reject(req.error);
        });
      }
      const open = indexedDB.open('wrapped-for-work');
      const db: IDBDatabase = await new Promise((resolve, reject) => {
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(open.error);
      });
      const tx = db.transaction(['identities', 'tokens'], 'readonly');
      const identities = await getAll<Record<string, unknown>>(tx.objectStore('identities'));
      const tokens = await getAll<Record<string, unknown>>(tx.objectStore('tokens'));
      return {
        identityRow: identities[0] ?? null,
        tokenRow: tokens[0] ?? null,
      };
    });

    expect(opaque.identityRow).toBeTruthy();
    expect(opaque.tokenRow).toBeTruthy();
    expect(JSON.stringify(opaque.identityRow)).not.toContain('alice@example.com');
    expect(JSON.stringify(opaque.identityRow)).not.toContain('Alice Example');
    expect(JSON.stringify(opaque.tokenRow)).not.toContain(PAT);
  });
});
