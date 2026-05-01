import type { SliceContent, WrapMode } from '@/lib/types';
import { db, rowToEnvelope, type WrapRow } from './db';
import { encryptJSON, decryptJSON } from './crypto';

type WrapSecret = {
  sliceContent: SliceContent[];
  title: string;
};

export type StoredWrap = {
  id: string;
  mode: WrapMode;
  windowStart: Date;
  windowEnd: Date;
  createdAt: Date;
  title: string;
  sliceContent: SliceContent[];
};

export async function saveWrap(input: {
  mode: WrapMode;
  windowStart: Date;
  windowEnd: Date;
  title: string;
  sliceContent: SliceContent[];
}): Promise<StoredWrap> {
  const id = crypto.randomUUID();
  const createdAt = new Date();
  const env = await encryptJSON({
    sliceContent: input.sliceContent,
    title: input.title,
  } satisfies WrapSecret);
  const row: WrapRow = {
    id,
    mode: input.mode,
    windowStart: input.windowStart.toISOString(),
    windowEnd: input.windowEnd.toISOString(),
    createdAt: createdAt.toISOString(),
    iv: env.iv,
    ct: env.ct,
  };
  await db().wraps.put(row);
  return { id, ...input, createdAt };
}

export async function getWrap(id: string): Promise<StoredWrap | null> {
  const row = await db().wraps.get(id);
  if (!row) return null;
  const secret = await decryptJSON<WrapSecret>(rowToEnvelope(row));
  return {
    id: row.id,
    mode: row.mode as WrapMode,
    windowStart: new Date(row.windowStart),
    windowEnd: new Date(row.windowEnd),
    createdAt: new Date(row.createdAt),
    title: secret.title,
    sliceContent: secret.sliceContent,
  };
}

export async function listWraps(): Promise<Array<Pick<StoredWrap, 'id' | 'mode' | 'windowStart' | 'windowEnd' | 'createdAt'>>> {
  const rows = await db().wraps.orderBy('createdAt').reverse().toArray();
  return rows.map((row) => ({
    id: row.id,
    mode: row.mode as WrapMode,
    windowStart: new Date(row.windowStart),
    windowEnd: new Date(row.windowEnd),
    createdAt: new Date(row.createdAt),
  }));
}
