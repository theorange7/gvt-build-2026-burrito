import type { ApiTokenAdapter, TokenSet } from '../types';
import { canonicalInstanceUrl, gitlabFetch, parseScopesHeader } from './client';
import type { GitLabUser } from './types';

export const gitlabAuth: ApiTokenAdapter = {
  kind: 'api-token',
  async validate({ instanceUrl, token }): Promise<TokenSet> {
    const canonical = canonicalInstanceUrl(instanceUrl);
    const response = await gitlabFetch<GitLabUser>({
      instanceUrl: canonical,
      path: '/api/v4/user',
      token,
    });
    const scopes = parseScopesHeader(response.headers);
    return {
      accessToken: token,
      scopes,
      obtainedAt: Date.now(),
    };
  },
};
