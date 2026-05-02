// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { gitlabSync } from '@/lib/providers/gitlab-dedicated/sync';
import type { ExternalIdentity, RawEvent, TokenSet } from '@/lib/providers/types';
import { TEST_GITLAB_BASE, TEST_GITLAB_PAT, gitlabCalls, clearGitlabCalls } from '../mocks/gitlab';

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
});

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
