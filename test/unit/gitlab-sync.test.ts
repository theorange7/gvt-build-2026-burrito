// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { gitlabSync, INTER_PAGE_DELAY_MS } from '@/lib/providers/gitlab-dedicated/sync';
import type { ExternalIdentity, RawEvent, SyncPageProgress, TokenSet } from '@/lib/providers/types';
import { ProviderRateLimitError } from '@/lib/providers/types';
import { TEST_GITLAB_BASE, TEST_GITLAB_PAT, gitlabCalls, clearGitlabCalls } from '../mocks/gitlab';
import type { GitLabEventFixture } from '../fixtures/gitlab';

const tokens: TokenSet = {
  accessToken: TEST_GITLAB_PAT,
  scopes: ['read_api', 'read_user'],
  obtainedAt: Date.now(),
};

const identity: ExternalIdentity = {
  providerId: 'gitlab-dedicated',
  instanceUrl: TEST_GITLAB_BASE,
  externalUserId: '4242',
  username: 'alice',
};

afterEach(() => {
  server.resetHandlers();
  clearGitlabCalls();
  vi.useRealTimers();
});

// Minimal event fixture factory for dynamic page generation.
function makeEvent(id: number): GitLabEventFixture {
  return {
    id,
    project_id: 1,
    action_name: 'pushed to',
    target_type: null,
    created_at: `2025-04-${String((id % 28) + 1).padStart(2, '0')}T10:00:00.000Z`,
    push_data: { commit_count: 1, action: 'pushed', ref_type: 'branch', ref: 'main' },
    author: { id: 4242, username: 'alice', name: 'Alice Example' },
  };
}

function pagedResponse(events: GitLabEventFixture[], page: number, totalPages: number) {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'X-Page': String(page),
    'X-Per-Page': '20',
    'X-Total-Pages': String(totalPages),
  };
  if (page < totalPages) headers['X-Next-Page'] = String(page + 1);
  return new HttpResponse(JSON.stringify(events), { status: 200, headers });
}

async function collect(iter: AsyncIterable<RawEvent>): Promise<RawEvent[]> {
  const out: RawEvent[] = [];
  for await (const e of iter) out.push(e);
  return out;
}

describe('gitlab-dedicated/sync', () => {
  it('iterates across paginated /events and yields all events', async () => {
    const ctrl = new AbortController();
    const events = await collect(
      gitlabSync.run({
        instanceUrl: TEST_GITLAB_BASE,
        identity,
        tokens,
        cursor: null,
        signal: ctrl.signal,
      }),
    );
    expect(events).toHaveLength(5);
    expect(events.every((e) => typeof e.occurredAt === 'number')).toBe(true);
  });

  it('passes the access token in the Authorization header', async () => {
    const ctrl = new AbortController();
    await collect(
      gitlabSync.run({
        instanceUrl: TEST_GITLAB_BASE,
        identity,
        tokens,
        cursor: null,
        signal: ctrl.signal,
      }),
    );
    expect(gitlabCalls.length).toBeGreaterThan(0);
    expect(gitlabCalls[0].authorization).toBe(`Bearer ${TEST_GITLAB_PAT}`);
  });

  it('translates a cursor with eventsAfter into ?after=YYYY-MM-DD', async () => {
    const ctrl = new AbortController();
    await collect(
      gitlabSync.run({
        instanceUrl: TEST_GITLAB_BASE,
        identity,
        tokens,
        cursor: { eventsAfter: '2025-04-01', cursorVersion: 1 },
        signal: ctrl.signal,
      }),
    );
    expect(gitlabCalls[0].url).toContain('after=2025-04-01');
  });

  it('stops iterating when the abort signal fires', async () => {
    const ctrl = new AbortController();
    const events: RawEvent[] = [];
    for await (const e of gitlabSync.run({
      instanceUrl: TEST_GITLAB_BASE,
      identity,
      tokens,
      cursor: null,
      signal: ctrl.signal,
    })) {
      events.push(e);
      ctrl.abort();
    }
    // After abort, no further pages are fetched.
    expect(events.length).toBeLessThanOrEqual(3); // page 1 has 3 events; page 2 should be skipped
    const page2Calls = gitlabCalls.filter((c) => /[?&]page=2(?:&|$)/.test(c.url));
    expect(page2Calls).toHaveLength(0);
  });

  it('surfaces 401 as ProviderAuthError', async () => {
    server.use(
      http.get(`${TEST_GITLAB_BASE}/api/v4/users/:id/events`, () =>
        new HttpResponse(JSON.stringify({ message: '401' }), { status: 401 }),
      ),
    );
    const ctrl = new AbortController();
    await expect(
      collect(
        gitlabSync.run({
          instanceUrl: TEST_GITLAB_BASE,
          identity,
          tokens,
          cursor: null,
          signal: ctrl.signal,
        }),
      ),
    ).rejects.toThrow(/401|auth/i);
  });

  it('surfaces 5xx as a transient error', async () => {
    server.use(
      http.get(`${TEST_GITLAB_BASE}/api/v4/users/:id/events`, () =>
        new HttpResponse(JSON.stringify({ message: '503' }), { status: 503 }),
      ),
    );
    const ctrl = new AbortController();
    await expect(
      collect(
        gitlabSync.run({
          instanceUrl: TEST_GITLAB_BASE,
          identity,
          tokens,
          cursor: null,
          signal: ctrl.signal,
        }),
      ),
    ).rejects.toThrow(/503|transient/i);
  });
});

describe('gitlab-dedicated/sync — throttling', () => {
  it('sleeps INTER_PAGE_DELAY_MS once per page (3-page sync = 3 sleeps)', async () => {
    vi.useFakeTimers();
    // Override to 3 pages of 1 event each.
    server.use(
      http.get(`${TEST_GITLAB_BASE}/api/v4/users/:id/events`, ({ request }) => {
        const page = Number(new URL(request.url).searchParams.get('page') ?? '1');
        return pagedResponse([makeEvent(page)], page, 3);
      }),
    );
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    const ctrl = new AbortController();
    const collectPromise = collect(
      gitlabSync.run({ instanceUrl: TEST_GITLAB_BASE, identity, tokens, cursor: null, signal: ctrl.signal }),
    );
    await vi.runAllTimersAsync();
    const events = await collectPromise;
    expect(events).toHaveLength(3);
    const delayCalls = setTimeoutSpy.mock.calls.filter(([, ms]) => ms === INTER_PAGE_DELAY_MS);
    expect(delayCalls).toHaveLength(3);
  });

  it('pauses until RateLimit-Reset when RateLimit-Remaining drops to ≤ 5 on page 2', async () => {
    vi.useFakeTimers();
    const resetEpoch = Math.floor(Date.now() / 1000) + 10; // 10 s from "now"
    server.use(
      http.get(`${TEST_GITLAB_BASE}/api/v4/users/:id/events`, ({ request }) => {
        const page = Number(new URL(request.url).searchParams.get('page') ?? '1');
        const headers: Record<string, string> = { 'content-type': 'application/json' };
        if (page < 3) headers['X-Next-Page'] = String(page + 1);
        if (page === 2) {
          headers['RateLimit-Remaining'] = '3';
          headers['RateLimit-Reset'] = String(resetEpoch);
        }
        return new HttpResponse(JSON.stringify([makeEvent(page)]), { status: 200, headers });
      }),
    );
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    const ctrl = new AbortController();
    const collectPromise = collect(
      gitlabSync.run({ instanceUrl: TEST_GITLAB_BASE, identity, tokens, cursor: null, signal: ctrl.signal }),
    );
    await vi.runAllTimersAsync();
    await collectPromise;
    // Expect at least one sleep longer than INTER_PAGE_DELAY_MS (the proactive rate-limit pause).
    const longSleeps = setTimeoutSpy.mock.calls.filter(([, ms]) => (ms as number) > INTER_PAGE_DELAY_MS);
    expect(longSleeps.length).toBeGreaterThanOrEqual(1);
  });

  it('retries page once on 429 and continues; propagates on second 429', async () => {
    vi.useFakeTimers();
    let page2Attempts = 0;
    server.use(
      http.get(`${TEST_GITLAB_BASE}/api/v4/users/:id/events`, ({ request }) => {
        const page = Number(new URL(request.url).searchParams.get('page') ?? '1');
        if (page === 1) return pagedResponse([makeEvent(1)], 1, 2);
        page2Attempts++;
        // First attempt 429, second succeeds.
        if (page2Attempts === 1) {
          return new HttpResponse(null, { status: 429, headers: { 'Retry-After': '1' } });
        }
        return pagedResponse([makeEvent(2)], 2, 2);
      }),
    );
    const ctrl = new AbortController();
    const collectPromise = collect(
      gitlabSync.run({ instanceUrl: TEST_GITLAB_BASE, identity, tokens, cursor: null, signal: ctrl.signal }),
    );
    await vi.runAllTimersAsync();
    const events = await collectPromise;
    expect(events).toHaveLength(2);
    expect(page2Attempts).toBe(2); // one failed + one retry
  });

  it('propagates ProviderRateLimitError when the retry also 429s', async () => {
    vi.useFakeTimers();
    server.use(
      http.get(`${TEST_GITLAB_BASE}/api/v4/users/:id/events`, ({ request }) => {
        const page = Number(new URL(request.url).searchParams.get('page') ?? '1');
        if (page === 1) return pagedResponse([makeEvent(1)], 1, 2);
        return new HttpResponse(null, { status: 429, headers: { 'Retry-After': '1' } });
      }),
    );
    const ctrl = new AbortController();
    const collectPromise = collect(
      gitlabSync.run({ instanceUrl: TEST_GITLAB_BASE, identity, tokens, cursor: null, signal: ctrl.signal }),
    );
    await vi.runAllTimersAsync();
    await expect(collectPromise).rejects.toBeInstanceOf(ProviderRateLimitError);
  });

  it('handles 100-page sync quickly with fake timers', async () => {
    const NUM_PAGES = 100;
    vi.useFakeTimers();
    server.use(
      http.get(`${TEST_GITLAB_BASE}/api/v4/users/:id/events`, ({ request }) => {
        const page = Number(new URL(request.url).searchParams.get('page') ?? '1');
        return pagedResponse([makeEvent(page)], page, NUM_PAGES);
      }),
    );
    const progressCalls: SyncPageProgress[] = [];
    const ctrl = new AbortController();
    const collectPromise = collect(
      gitlabSync.run({
        instanceUrl: TEST_GITLAB_BASE,
        identity,
        tokens,
        cursor: null,
        signal: ctrl.signal,
        onProgress: (p) => progressCalls.push(p),
      }),
    );
    await vi.runAllTimersAsync();
    const events = await collectPromise;

    expect(events).toHaveLength(NUM_PAGES);
    expect(progressCalls).toHaveLength(NUM_PAGES);
    // callsMade and eventsReceived must be strictly increasing
    for (let i = 1; i < progressCalls.length; i++) {
      expect(progressCalls[i].callsMade).toBeGreaterThan(progressCalls[i - 1].callsMade);
      expect(progressCalls[i].eventsReceived).toBeGreaterThan(progressCalls[i - 1].eventsReceived);
    }
    // Pages are 1-based
    expect(progressCalls[0].page).toBe(1);
    expect(progressCalls[NUM_PAGES - 1].page).toBe(NUM_PAGES);
  });
});
