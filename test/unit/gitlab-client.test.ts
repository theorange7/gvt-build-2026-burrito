// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { gitlabFetch, parseRateLimitHeaders } from '@/lib/providers/gitlab-dedicated/client';
import { ProviderRateLimitError } from '@/lib/providers/types';
import { TEST_GITLAB_BASE, TEST_GITLAB_PAT } from '../mocks/gitlab';

const baseOpts = {
  instanceUrl: TEST_GITLAB_BASE,
  path: '/api/v4/users/4242/events',
  token: TEST_GITLAB_PAT,
};

afterEach(() => server.resetHandlers());

describe('parseRateLimitHeaders', () => {
  it('parses both headers when present', () => {
    const headers = new Headers({
      'RateLimit-Remaining': '42',
      'RateLimit-Reset': '1700000000',
    });
    expect(parseRateLimitHeaders(headers)).toEqual({ remaining: 42, resetAt: 1700000000 });
  });

  it('returns null for absent headers', () => {
    expect(parseRateLimitHeaders(new Headers())).toEqual({ remaining: null, resetAt: null });
  });

  it('returns null for non-numeric values', () => {
    const headers = new Headers({ 'RateLimit-Remaining': 'n/a', 'RateLimit-Reset': '' });
    expect(parseRateLimitHeaders(headers)).toEqual({ remaining: null, resetAt: null });
  });
});

describe('gitlabFetch — 429 handling', () => {
  it('throws ProviderRateLimitError with retryAfterSeconds from Retry-After header', async () => {
    server.use(
      http.get(`${TEST_GITLAB_BASE}/api/v4/users/4242/events`, () =>
        new HttpResponse(null, {
          status: 429,
          headers: { 'Retry-After': '15' },
        }),
      ),
    );
    const err = await gitlabFetch({ ...baseOpts }).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderRateLimitError);
    expect((err as ProviderRateLimitError).retryAfterSeconds).toBe(15);
    expect((err as ProviderRateLimitError).status).toBe(429);
  });

  it('defaults retryAfterSeconds to 30 when Retry-After header is absent', async () => {
    server.use(
      http.get(`${TEST_GITLAB_BASE}/api/v4/users/4242/events`, () =>
        new HttpResponse(null, { status: 429 }),
      ),
    );
    const err = await gitlabFetch({ ...baseOpts }).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderRateLimitError);
    expect((err as ProviderRateLimitError).retryAfterSeconds).toBe(30);
  });

  it('defaults retryAfterSeconds to 30 when Retry-After header is non-numeric', async () => {
    server.use(
      http.get(`${TEST_GITLAB_BASE}/api/v4/users/4242/events`, () =>
        new HttpResponse(null, {
          status: 429,
          headers: { 'Retry-After': 'soon' },
        }),
      ),
    );
    const err = await gitlabFetch({ ...baseOpts }).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderRateLimitError);
    expect((err as ProviderRateLimitError).retryAfterSeconds).toBe(30);
  });
});
