import { describe, expect, it } from 'vitest';
import { parseProvidersConfig } from '@/lib/providers/config';

describe('providers/config', () => {
  it('accepts a valid config', () => {
    const parsed = parseProvidersConfig({
      providers: [
        {
          id: 'gitlab-dedicated',
          label: 'GitLab Dedicated',
          authMethods: ['api-token'],
          scopes: ['read_api', 'read_user'],
          requiresInstanceUrl: true,
        },
      ],
    });
    expect(parsed.providers).toHaveLength(1);
    expect(parsed.providers[0].id).toBe('gitlab-dedicated');
  });

  it('rejects duplicate ids', () => {
    expect(() =>
      parseProvidersConfig({
        providers: [
          {
            id: 'gitlab-dedicated',
            label: 'A',
            authMethods: ['api-token'],
            scopes: [],
            requiresInstanceUrl: true,
          },
          {
            id: 'gitlab-dedicated',
            label: 'B',
            authMethods: ['api-token'],
            scopes: [],
            requiresInstanceUrl: true,
          },
        ],
      }),
    ).toThrow(/duplicate provider id/i);
  });

  it('rejects empty providers array', () => {
    expect(() => parseProvidersConfig({ providers: [] })).toThrow();
  });

  it('rejects unknown auth methods', () => {
    expect(() =>
      parseProvidersConfig({
        providers: [
          {
            id: 'x',
            label: 'X',
            authMethods: ['mystery-handshake'],
            scopes: [],
            requiresInstanceUrl: true,
          },
        ],
      }),
    ).toThrow();
  });

  it('rejects malformed JSON shape', () => {
    expect(() => parseProvidersConfig({ wrong: 'shape' })).toThrow();
  });
});
