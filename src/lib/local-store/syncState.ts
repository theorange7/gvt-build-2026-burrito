import type { SyncCursor } from '@/lib/providers/types';
import { db, type SyncStateRow } from './db';
import { decryptJSON, encryptJSON } from './crypto';

export type StoredSyncState = {
  identityId: string;
  cursor: SyncCursor | null;
  lastSyncAt: number | null;
  lastError: string | null;
  callsMadeLastSync?: number;
  eventsReceivedLastSync?: number;
  pagesLastSync?: number;
  lastSyncDurationMs?: number;
};

export async function getSyncState(identityId: string): Promise<StoredSyncState | null> {
  const row = await db().syncState.get(identityId);
  if (!row) return null;
  let cursor: SyncCursor | null = null;
  if (row.iv && row.ct) {
    cursor = await decryptJSON<SyncCursor>({ iv: row.iv, ct: row.ct });
  }
  return {
    identityId: row.identityId,
    cursor,
    lastSyncAt: row.lastSyncAt,
    lastError: row.lastError,
    callsMadeLastSync: row.callsMadeLastSync,
    eventsReceivedLastSync: row.eventsReceivedLastSync,
    pagesLastSync: row.pagesLastSync,
    lastSyncDurationMs: row.lastSyncDurationMs,
  };
}

export async function setSyncCursor(identityId: string, cursor: SyncCursor): Promise<void> {
  const env = await encryptJSON(cursor);
  const existing = await db().syncState.get(identityId);
  const row: SyncStateRow = {
    identityId,
    lastSyncAt: existing?.lastSyncAt ?? null,
    lastError: existing?.lastError ?? null,
    iv: env.iv,
    ct: env.ct,
  };
  await db().syncState.put(row);
}

export async function setSyncResult(
  identityId: string,
  result: {
    lastSyncAt: number | null;
    lastError: string | null;
    callsMadeLastSync?: number;
    eventsReceivedLastSync?: number;
    pagesLastSync?: number;
    lastSyncDurationMs?: number;
  },
): Promise<void> {
  const existing = await db().syncState.get(identityId);
  const row: SyncStateRow = {
    identityId,
    lastSyncAt: result.lastSyncAt,
    lastError: result.lastError,
    iv: existing?.iv ?? null,
    ct: existing?.ct ?? null,
    callsMadeLastSync: result.callsMadeLastSync,
    eventsReceivedLastSync: result.eventsReceivedLastSync,
    pagesLastSync: result.pagesLastSync,
    lastSyncDurationMs: result.lastSyncDurationMs,
  };
  await db().syncState.put(row);
}

export async function deleteSyncState(identityId: string): Promise<void> {
  await db().syncState.delete(identityId);
}
