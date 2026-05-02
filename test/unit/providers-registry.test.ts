import { afterEach, describe, expect, it } from 'vitest';
import {
  __resetRegistryForTest,
  getProvider,
  hasProvider,
  listProviders,
  registerProvider,
} from '@/lib/providers/registry';
import type { ContributionProvider } from '@/lib/providers/types';

function fakeProvider(id: string): ContributionProvider {
  return {
    id,
    displayName: `Fake ${id}`,
    capabilities: {
      requiresInstanceUrl: true,
      supportsRevocation: false,
      supportsIncrementalSync: true,
      defaultScopes: ['read'],
    },
    auth: {
      kind: 'api-token',
      validate: async () => ({ accessToken: 't', scopes: [], obtainedAt: 0 }),
    },
    identity: {
      resolve: async () => ({
        providerId: id,
        instanceUrl: 'https://example.com',
        externalUserId: '0',
      }),
    },
    sync: {
      run: async function* () {},
      normalize: () => [],
      externalIdFor: () => '',
    },
  };
}

afterEach(() => {
  __resetRegistryForTest();
});

describe('providers/registry', () => {
  it('starts empty', () => {
    expect(listProviders()).toEqual([]);
    expect(hasProvider('anything')).toBe(false);
  });

  it('registers and retrieves a provider', () => {
    registerProvider(fakeProvider('alpha'));
    expect(hasProvider('alpha')).toBe(true);
    expect(getProvider('alpha').id).toBe('alpha');
    expect(listProviders().map((p) => p.id)).toEqual(['alpha']);
  });

  it('throws on duplicate registration', () => {
    registerProvider(fakeProvider('alpha'));
    expect(() => registerProvider(fakeProvider('alpha'))).toThrow(/already registered/i);
  });

  it('throws when getting an unknown provider', () => {
    expect(() => getProvider('nope')).toThrow(/unknown provider/i);
  });
});
