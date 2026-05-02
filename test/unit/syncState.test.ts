import { beforeEach, describe, expect, it } from 'vitest';
import {
  deleteSyncState,
  getSyncState,
  setSyncCursor,
  setSyncResult,
} from '@/lib/local-store/syncState';
import { loadTestKey } from '../setup/key';

describe('local-store/syncState', () => {
  beforeEach(async () => {
    await loadTestKey();
  });

  it('returns null when no state exists yet', async () => {
    expect(await getSyncState('id-x')).toBeNull();
  });

  it('persists and reads back an encrypted cursor', async () => {
    await setSyncCursor('id-1', { eventsAfter: '2025-01-01', cursorVersion: 1 });
    const state = await getSyncState('id-1');
    expect(state).not.toBeNull();
    expect(state?.cursor).toEqual({ eventsAfter: '2025-01-01', cursorVersion: 1 });
    expect(state?.lastSyncAt).toBeNull();
    expect(state?.lastError).toBeNull();
  });

  it('updates lastSyncAt and lastError without disturbing the cursor', async () => {
    await setSyncCursor('id-1', { eventsAfter: '2025-02-01', cursorVersion: 1 });
    await setSyncResult('id-1', { lastSyncAt: 1_700_000_000_000, lastError: null });

    const state = await getSyncState('id-1');
    expect(state?.cursor).toEqual({ eventsAfter: '2025-02-01', cursorVersion: 1 });
    expect(state?.lastSyncAt).toBe(1_700_000_000_000);
    expect(state?.lastError).toBeNull();
  });

  it('records the most recent error', async () => {
    await setSyncResult('id-1', { lastSyncAt: 0, lastError: 'auth: 401' });
    const state = await getSyncState('id-1');
    expect(state?.lastError).toBe('auth: 401');
  });

  it('deletes sync state', async () => {
    await setSyncCursor('id-1', { eventsAfter: '2025-01-01', cursorVersion: 1 });
    await deleteSyncState('id-1');
    expect(await getSyncState('id-1')).toBeNull();
  });
});
