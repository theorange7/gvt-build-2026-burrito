// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  backfillIdentity,
  connectIdentityWithApiToken,
  disconnectIdentity,
  syncIdentity,
} from '@/lib/providers/orchestrator';
import { listContributions, listContributionsInRange } from '@/lib/local-store/contributions';
import { listIdentities } from '@/lib/local-store/identities';
import { getTokens } from '@/lib/local-store/tokens';
import { getSyncState } from '@/lib/local-store/syncState';
import { listImportedRanges } from '@/lib/local-store/importedRanges';
import { db } from '@/lib/local-store/db';
import { TEST_GITLAB_BASE, TEST_GITLAB_PAT, clearGitlabCalls } from '../mocks/gitlab';
import type { SyncPageProgress } from '@/lib/providers/types';
import { loadTestKey } from '../setup/key';
import { hasProvider, registerProvider } from '@/lib/providers/registry';
import { gitlabDedicatedProvider } from '@/lib/providers/gitlab-dedicated';

beforeEach(async () => {
  await loadTestKey();
  if (!hasProvider('gitlab-dedicated')) {
    registerProvider(gitlabDedicatedProvider);
  }
});

afterEach(() => {
  clearGitlabCalls();
  vi.useRealTimers();
});

async function connect() {
  return connectIdentityWithApiToken({
    providerId: 'gitlab-dedicated',
    instanceUrl: TEST_GITLAB_BASE,
    token: TEST_GITLAB_PAT,
  });
}

describe('orchestrator — connect / sync / backfill / disconnect', () => {
  it('connects with a PAT and persists encrypted identity + tokens', async () => {
    const result = await connect();
    expect(result.identityId).toMatch(/^[0-9a-f-]{36}$/);

    const identities = await listIdentities();
    expect(identities).toHaveLength(1);
    expect(identities[0].providerId).toBe('gitlab-dedicated');
    expect(identities[0].externalUserId).toBe('4242');

    const tokens = await getTokens(result.identityId);
    expect(tokens?.accessToken).toBe(TEST_GITLAB_PAT);

    const rawIdentity = await db().identities.get(result.identityId);
    expect(JSON.stringify(rawIdentity)).not.toContain('alice@example.com');
    const rawToken = await db().tokens.where('identityId').equals(result.identityId).first();
    expect(JSON.stringify(rawToken)).not.toContain(TEST_GITLAB_PAT);
  });

  it('reusing the same PAT against the same instance is idempotent (no duplicate identity)', async () => {
    await connect();
    await connect();
    expect(await listIdentities()).toHaveLength(1);
  });

  it('syncIdentity normalizes events into contributions', async () => {
    const { identityId } = await connect();
    const result = await syncIdentity(identityId);
    expect(result.added).toBeGreaterThan(0);

    const all = await listContributions();
    expect(all.length).toBe(result.added);
    expect(all.every((c) => c.source === 'gitlab')).toBe(true);
    expect(all.every((c) => c.identityId === identityId)).toBe(true);

    const state = await getSyncState(identityId);
    expect(state?.lastError).toBeNull();
    expect(state?.lastSyncAt).toBeGreaterThan(0);
  });

  it('a second sync with the same fixtures dedups via (identityId, externalKey)', async () => {
    const { identityId } = await connect();
    await syncIdentity(identityId);
    const beforeSecond = (await listContributions()).length;
    const second = await syncIdentity(identityId);
    expect(second.added).toBe(0);
    expect(second.skippedExisting).toBeGreaterThan(0);
    const afterSecond = (await listContributions()).length;
    expect(afterSecond).toBe(beforeSecond);
  });

  it('backfillIdentity writes contributions in range and records the imported range', async () => {
    const { identityId } = await connect();
    const result = await backfillIdentity(identityId, {
      start: new Date('2025-04-01T00:00:00Z'),
      end: new Date('2025-05-01T00:00:00Z'),
    });
    expect(result.added).toBeGreaterThan(0);
    expect(result.skippedFullyCovered).toBe(false);

    const ranges = await listImportedRanges(identityId);
    expect(ranges).toHaveLength(1);
    expect(ranges[0].start.toISOString()).toBe('2025-04-01T00:00:00.000Z');
    expect(ranges[0].end.toISOString()).toBe('2025-05-01T00:00:00.000Z');

    const inRange = await listContributionsInRange(
      new Date('2025-04-01T00:00:00Z'),
      new Date('2025-05-01T00:00:00Z'),
    );
    expect(inRange.length).toBeGreaterThan(0);
  });

  it('backfill is skipped entirely when the requested range is already fully covered', async () => {
    const { identityId } = await connect();
    await backfillIdentity(identityId, {
      start: new Date('2025-01-01T00:00:00Z'),
      end: new Date('2025-12-31T00:00:00Z'),
    });
    const second = await backfillIdentity(identityId, {
      start: new Date('2025-04-01T00:00:00Z'),
      end: new Date('2025-05-01T00:00:00Z'),
    });
    expect(second.skippedFullyCovered).toBe(true);
    expect(second.added).toBe(0);
  });

  it('disconnect removes identity, tokens, sync state, and (when asked) contributions', async () => {
    const { identityId } = await connect();
    await syncIdentity(identityId);
    await disconnectIdentity(identityId, { deleteContributions: true });

    expect(await listIdentities()).toHaveLength(0);
    expect(await getTokens(identityId)).toBeNull();
    expect(await getSyncState(identityId)).toBeNull();
    expect(await listContributions()).toHaveLength(0);
  });

  it('disconnect with deleteContributions=false retains the historical timeline', async () => {
    const { identityId } = await connect();
    await syncIdentity(identityId);
    const before = (await listContributions()).length;
    await disconnectIdentity(identityId, { deleteContributions: false });
    expect(await listIdentities()).toHaveLength(0);
    expect((await listContributions()).length).toBe(before);
  });

  it('onProgress is called once per page with strictly-increasing callsMade and eventsReceived', async () => {
    const { identityId } = await connect();
    const progressCalls: SyncPageProgress[] = [];
    await syncIdentity(identityId, {
      onProgress: (p) => progressCalls.push({ ...p }),
    });

    // Default mock has 2 pages.
    expect(progressCalls).toHaveLength(2);
    // Pages are 1-based.
    expect(progressCalls[0].page).toBe(1);
    expect(progressCalls[1].page).toBe(2);
    // callsMade and eventsReceived are strictly increasing.
    expect(progressCalls[1].callsMade).toBeGreaterThan(progressCalls[0].callsMade);
    expect(progressCalls[1].eventsReceived).toBeGreaterThan(progressCalls[0].eventsReceived);
  });

  it('persists callsMadeLastSync, pagesLastSync, and lastSyncDurationMs to syncState', async () => {
    const { identityId } = await connect();
    await syncIdentity(identityId);

    const state = await getSyncState(identityId);
    expect(state?.callsMadeLastSync).toBeGreaterThan(0);
    expect(state?.pagesLastSync).toBeGreaterThan(0);
    expect(state?.lastSyncDurationMs).toBeGreaterThanOrEqual(0);
    expect(state?.eventsReceivedLastSync).toBeGreaterThan(0);
  });
});
