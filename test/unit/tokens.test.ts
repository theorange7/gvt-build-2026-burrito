import { beforeEach, describe, expect, it } from 'vitest';
import { deleteTokens, getTokens, putTokens } from '@/lib/local-store/tokens';
import { db } from '@/lib/local-store/db';
import { loadTestKey } from '../setup/key';

describe('local-store/tokens', () => {
  beforeEach(async () => {
    await loadTestKey();
  });

  it('round-trips a token set keyed by identityId', async () => {
    await putTokens('identity-1', {
      accessToken: 'glpat-redacted-abc123',
      scopes: ['read_api', 'read_user'],
      obtainedAt: 1_700_000_000_000,
    });

    const fetched = await getTokens('identity-1');
    expect(fetched).not.toBeNull();
    expect(fetched?.accessToken).toBe('glpat-redacted-abc123');
    expect(fetched?.scopes).toEqual(['read_api', 'read_user']);
  });

  it('replaces tokens on subsequent put for the same identity', async () => {
    await putTokens('id-1', {
      accessToken: 'first',
      scopes: ['read_api'],
      obtainedAt: 1,
    });
    await putTokens('id-1', {
      accessToken: 'second',
      scopes: ['read_api', 'read_user'],
      obtainedAt: 2,
    });

    const fetched = await getTokens('id-1');
    expect(fetched?.accessToken).toBe('second');
    expect((await db().tokens.toArray()).length).toBe(1);
  });

  it('keeps the access token out of plaintext storage', async () => {
    const secret = 'glpat-VERY-SECRET-1234';
    await putTokens('id-1', {
      accessToken: secret,
      scopes: ['read_api'],
      obtainedAt: 1,
    });
    const raw = await db().tokens.get({ identityId: 'id-1' });
    expect(raw).toBeDefined();
    expect(JSON.stringify(raw)).not.toContain(secret);
  });

  it('returns null when no tokens exist for an identity', async () => {
    expect(await getTokens('missing')).toBeNull();
  });

  it('deletes tokens for an identity', async () => {
    await putTokens('id-1', { accessToken: 't', scopes: [], obtainedAt: 0 });
    await deleteTokens('id-1');
    expect(await getTokens('id-1')).toBeNull();
  });
});
