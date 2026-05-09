/**
 * Tracks wrap-generation jobs the user has submitted to the backend but that
 * haven't yet completed. Rows are *not* encrypted: the table only stores
 * metadata (mode, window dates, status, the server-assigned jobId). Nothing
 * here is sensitive; encrypting it would only obscure indexable fields the
 * polling hook relies on.
 */
import type { JobStatus, WrapMode } from '@wrapped/shared';
import { db, type PendingWrapRow } from './db';

export type PendingWrap = {
  id: string;
  mode: WrapMode;
  windowStart: Date;
  windowEnd: Date;
  requestedAt: Date;
  status: JobStatus;
  busy: boolean;
  modelId?: string;
  lastCheckedAt?: Date;
};

function rowToPending(row: PendingWrapRow): PendingWrap {
  return {
    id: row.id,
    mode: row.mode as WrapMode,
    windowStart: new Date(row.windowStart),
    windowEnd: new Date(row.windowEnd),
    requestedAt: new Date(row.requestedAt),
    status: row.status as JobStatus,
    busy: row.busy === 1,
    modelId: row.modelId,
    lastCheckedAt: row.lastCheckedAt ? new Date(row.lastCheckedAt) : undefined,
  };
}

function pendingToRow(p: PendingWrap): PendingWrapRow {
  return {
    id: p.id,
    mode: p.mode,
    windowStart: p.windowStart.toISOString(),
    windowEnd: p.windowEnd.toISOString(),
    requestedAt: p.requestedAt.toISOString(),
    status: p.status,
    busy: p.busy ? 1 : 0,
    modelId: p.modelId,
    lastCheckedAt: p.lastCheckedAt?.toISOString(),
  };
}

export async function addPendingWrap(p: PendingWrap): Promise<void> {
  await db().pendingWrapRequests.put(pendingToRow(p));
}

export async function getPendingWrap(id: string): Promise<PendingWrap | null> {
  const row = await db().pendingWrapRequests.get(id);
  return row ? rowToPending(row) : null;
}

export async function listPendingWraps(): Promise<PendingWrap[]> {
  const rows = await db().pendingWrapRequests.toArray();
  return rows.map(rowToPending);
}

export async function updatePendingWrap(id: string, patch: Partial<PendingWrap>): Promise<void> {
  const partial: Partial<PendingWrapRow> = {};
  if (patch.status !== undefined) partial.status = patch.status;
  if (patch.busy !== undefined) partial.busy = patch.busy ? 1 : 0;
  if (patch.lastCheckedAt !== undefined) partial.lastCheckedAt = patch.lastCheckedAt.toISOString();
  if (patch.modelId !== undefined) partial.modelId = patch.modelId;
  if (Object.keys(partial).length) {
    await db().pendingWrapRequests.update(id, partial);
  }
}

export async function removePendingWrap(id: string): Promise<void> {
  await db().pendingWrapRequests.delete(id);
}
