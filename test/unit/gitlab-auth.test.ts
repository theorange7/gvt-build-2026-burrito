// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { server } from '../mocks/server';
import { http, HttpResponse } from 'msw';
import { gitlabAuth } from '@/lib/providers/gitlab-dedicated/auth';
import { gitlabIdentity } from '@/lib/providers/gitlab-dedicated/identity';
import { ProviderAuthError } from '@/lib/providers/types';
import { TEST_GITLAB_BASE, TEST_GITLAB_PAT } from '../mocks/gitlab';

afterEach(() => {
  server.resetHandlers();
});

describe('gitlab-dedicated/auth (PAT)', () => {
  it('rejects http:// instance URLs without making a network call', async () => {
    await expect(
      gitlabAuth.validate({ instanceUrl: 'http://gitlab.test.example.com', token: TEST_GITLAB_PAT }),
    ).rejects.toThrow(/https/i);
  });

  it('rejects malformed instance URLs', async () => {
    await expect(
      gitlabAuth.validate({ instanceUrl: 'not-a-url', token: TEST_GITLAB_PAT }),
    ).rejects.toThrow();
  });

  it('returns a TokenSet with parsed scopes on success', async () => {
    const tokens = await gitlabAuth.validate({
      instanceUrl: TEST_GITLAB_BASE,
      token: TEST_GITLAB_PAT,
    });
    expect(tokens.accessToken).toBe(TEST_GITLAB_PAT);
    expect(tokens.scopes).toEqual(expect.arrayContaining(['read_api', 'read_user']));
    expect(tokens.refreshToken).toBeUndefined();
    expect(tokens.expiresAt).toBeUndefined();
    expect(typeof tokens.obtainedAt).toBe('number');
  });

  it('throws ProviderAuthError on 401', async () => {
    await expect(
      gitlabAuth.validate({ instanceUrl: TEST_GITLAB_BASE, token: 'bogus' }),
    ).rejects.toBeInstanceOf(ProviderAuthError);
  });

  it('identity.resolve maps the user payload to ExternalIdentity', async () => {
    const tokens = await gitlabAuth.validate({
      instanceUrl: TEST_GITLAB_BASE,
      token: TEST_GITLAB_PAT,
    });
    const identity = await gitlabIdentity.resolve({ instanceUrl: TEST_GITLAB_BASE, tokens });
    expect(identity.providerId).toBe('gitlab-dedicated');
    expect(identity.instanceUrl).toBe(TEST_GITLAB_BASE);
    expect(identity.externalUserId).toBe('4242');
    expect(identity.username).toBe('alice');
    expect(identity.email).toBe('alice@example.com');
    expect(identity.displayName).toBe('Alice Example');
  });

  it('strips trailing slashes from the canonical instanceUrl', async () => {
    const tokens = await gitlabAuth.validate({
      instanceUrl: `${TEST_GITLAB_BASE}/`,
      token: TEST_GITLAB_PAT,
    });
    expect(tokens.accessToken).toBe(TEST_GITLAB_PAT);
  });

  it('surfaces 5xx as a transient error', async () => {
    server.use(
      http.get(`${TEST_GITLAB_BASE}/api/v4/user`, () =>
        new HttpResponse(JSON.stringify({ message: 'maintenance' }), { status: 503 }),
      ),
    );
    await expect(
      gitlabAuth.validate({ instanceUrl: TEST_GITLAB_BASE, token: TEST_GITLAB_PAT }),
    ).rejects.toThrow(/503|transient|maintenance/i);
  });
});
