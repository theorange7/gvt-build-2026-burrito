import type { ExternalIdentity, IdentityAdapter } from '../types';
import { canonicalInstanceUrl, gitlabFetch } from './client';
import type { GitLabUser } from './types';

export const gitlabIdentity: IdentityAdapter = {
  async resolve({ instanceUrl, tokens }): Promise<ExternalIdentity> {
    const canonical = canonicalInstanceUrl(instanceUrl);
    const response = await gitlabFetch<GitLabUser>({
      instanceUrl: canonical,
      path: '/api/v4/user',
      token: tokens.accessToken,
    });
    const user = response.data;
    return {
      providerId: 'gitlab-dedicated',
      instanceUrl: canonical,
      externalUserId: String(user.id),
      username: user.username,
      email: user.email,
      displayName: user.name,
    };
  },
};
