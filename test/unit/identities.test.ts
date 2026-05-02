import { beforeEach, describe, expect, it } from 'vitest';
import {
  deleteIdentity,
  findIdentity,
  getIdentity,
  listIdentities,
  upsertIdentity,
} from '@/lib/local-store/identities';
import { db } from '@/lib/local-store/db';
import { loadTestKey } from '../setup/key';

describe('local-store/identities', () => {
  beforeEach(async () => {
    await loadTestKey();
  });

  it('inserts a new identity and round-trips encrypted profile fields', async () => {
    const created = await upsertIdentity({
      providerId: 'gitlab-dedicated',
      instanceUrl: 'https://gitlab.example.com',
      externalUserId: '4242',
      username: 'alice',
      email: 'alice@example.com',
      displayName: 'Alice Example',
    });

    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(created.providerId).toBe('gitlab-dedicated');
    expect(created.username).toBe('alice');
    expect(created.email).toBe('alice@example.com');

    const fetched = await getIdentity(created.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.username).toBe('alice');
    expect(fetched?.displayName).toBe('Alice Example');
  });

  it('keeps profile fields out of plaintext storage', async () => {
    const created = await upsertIdentity({
      providerId: 'gitlab-dedicated',
      instanceUrl: 'https://gitlab.example.com',
      externalUserId: '99',
      username: 'top-secret-handle',
      email: 'sensitive@example.com',
    });

    const raw = await db().identities.get(created.id);
    expect(raw).toBeDefined();
    const json = JSON.stringify(raw);
    expect(json).not.toContain('top-secret-handle');
    expect(json).not.toContain('sensitive@example.com');
    // Indexed fields stay clear:
    expect(raw?.providerId).toBe('gitlab-dedicated');
    expect(raw?.externalUserId).toBe('99');
  });

  it('upsert is idempotent on (providerId, instanceUrl, externalUserId)', async () => {
    const a = await upsertIdentity({
      providerId: 'gitlab-dedicated',
      instanceUrl: 'https://gitlab.example.com',
      externalUserId: '1',
      username: 'first',
    });
    const b = await upsertIdentity({
      providerId: 'gitlab-dedicated',
      instanceUrl: 'https://gitlab.example.com',
      externalUserId: '1',
      username: 'second',
    });

    expect(b.id).toBe(a.id);
    const fetched = await getIdentity(a.id);
    expect(fetched?.username).toBe('second');

    const all = await listIdentities();
    expect(all).toHaveLength(1);
  });

  it('treats different instanceUrls as separate identities', async () => {
    const a = await upsertIdentity({
      providerId: 'gitlab-dedicated',
      instanceUrl: 'https://gitlab.a.example.com',
      externalUserId: '1',
      username: 'alice',
    });
    const b = await upsertIdentity({
      providerId: 'gitlab-dedicated',
      instanceUrl: 'https://gitlab.b.example.com',
      externalUserId: '1',
      username: 'alice',
    });

    expect(a.id).not.toBe(b.id);
    expect(await listIdentities()).toHaveLength(2);
  });

  it('finds identity by composite key', async () => {
    const created = await upsertIdentity({
      providerId: 'gitlab-dedicated',
      instanceUrl: 'https://gitlab.example.com',
      externalUserId: '7',
      username: 'bob',
    });

    const found = await findIdentity('gitlab-dedicated', 'https://gitlab.example.com', '7');
    expect(found?.id).toBe(created.id);
    expect(found?.username).toBe('bob');

    const notFound = await findIdentity('gitlab-dedicated', 'https://gitlab.example.com', '8');
    expect(notFound).toBeNull();
  });

  it('deletes an identity', async () => {
    const a = await upsertIdentity({
      providerId: 'gitlab-dedicated',
      instanceUrl: 'https://gitlab.example.com',
      externalUserId: '1',
      username: 'a',
    });
    await upsertIdentity({
      providerId: 'gitlab-dedicated',
      instanceUrl: 'https://gitlab.example.com',
      externalUserId: '2',
      username: 'b',
    });
    await deleteIdentity(a.id);
    const all = await listIdentities();
    expect(all).toHaveLength(1);
    expect(all[0].externalUserId).toBe('2');
  });
});
