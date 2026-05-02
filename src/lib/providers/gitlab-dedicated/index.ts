/*
 * PRIVACY: This module talks directly to a user-supplied GitLab instance
 * from the browser. It receives tokens by parameter and returns parsed
 * data; persistence is the orchestrator's job. Do not import from
 * src/lib/local-store/*. Do not log tokens, request bodies, or response
 * bodies.
 */
import { registerProvider } from '../registry';
import type { ContributionProvider } from '../types';
import { gitlabAuth } from './auth';
import { gitlabIdentity } from './identity';
import { gitlabSync } from './sync';

export const gitlabDedicatedProvider: ContributionProvider = {
  id: 'gitlab-dedicated',
  displayName: 'GitLab Dedicated',
  capabilities: {
    requiresInstanceUrl: true,
    supportsRevocation: false,
    supportsIncrementalSync: true,
    defaultScopes: ['read_api', 'read_user'],
  },
  auth: gitlabAuth,
  identity: gitlabIdentity,
  sync: gitlabSync,
};

registerProvider(gitlabDedicatedProvider);
