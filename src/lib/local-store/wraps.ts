import type { SliceContent, WrapMode } from '@/lib/types';
import { db, rowToEnvelope, type WrapRow } from './db';
import { encryptJSON, decryptJSON } from './crypto';

type WrapSecret = {
  sliceContent: SliceContent[];
  title: string;
  shareSlug?: string;
  shareUrl?: string;
};

export type StoredWrap = {
  id: string;
  mode: WrapMode;
  windowStart: Date;
  windowEnd: Date;
  createdAt: Date;
  title: string;
  sliceContent: SliceContent[];
  shareSlug?: string;
  shareUrl?: string;
};

export async function saveWrap(input: {
  id?: string;
  mode: WrapMode;
  windowStart: Date;
  windowEnd: Date;
  title: string;
  sliceContent: SliceContent[];
  shareSlug?: string;
  shareUrl?: string;
}): Promise<StoredWrap> {
  const id = input.id ?? crypto.randomUUID();
  const createdAt = new Date();
  // Share metadata rides inside the encrypted envelope alongside title and
  // sliceContent (spec 31 — never as plaintext columns). The unlock key
  // already protects every other byte on the wrap row; share fields get the
  // same treatment so a raw IndexedDB dump leaks neither the slug nor the URL.
  const env = await encryptJSON({
    sliceContent: input.sliceContent,
    title: input.title,
    shareSlug: input.shareSlug,
    shareUrl: input.shareUrl,
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
  const { id: _ignored, ...rest } = input;
  return { id, ...rest, createdAt };
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
    shareSlug: secret.shareSlug,
    shareUrl: secret.shareUrl,
  };
}

/**
 * Update only the share fields on an existing wrap (used when the user
 * revokes via "Stop sharing"). Round-trips through encrypt/decrypt — the
 * unlock key must be active. No-op if the wrap doesn't exist.
 */
export async function updateWrapShare(
  id: string,
  patch: { shareSlug?: string; shareUrl?: string },
): Promise<void> {
  const row = await db().wraps.get(id);
  if (!row) return;
  const secret = await decryptJSON<WrapSecret>(rowToEnvelope(row));
  const env = await encryptJSON({
    sliceContent: secret.sliceContent,
    title: secret.title,
    shareSlug: patch.shareSlug,
    shareUrl: patch.shareUrl,
  } satisfies WrapSecret);
  await db().wraps.update(id, { iv: env.iv, ct: env.ct });
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

/**
 * Map of wrap id → share metadata for every wrap that currently has a share
 * link. Requires the unlock key (share fields ride inside the encrypted
 * envelope). Dashboard surfaces use this to decide which wrap cards get the
 * "Copy link" / "Stop sharing" affordance.
 */
export async function listWrapShares(): Promise<
  Record<string, { shareSlug: string; shareUrl: string }>
> {
  const rows = await db().wraps.toArray();
  const out: Record<string, { shareSlug: string; shareUrl: string }> = {};
  for (const row of rows) {
    try {
      const secret = await decryptJSON<WrapSecret>(rowToEnvelope(row));
      if (secret.shareSlug && secret.shareUrl) {
        out[row.id] = { shareSlug: secret.shareSlug, shareUrl: secret.shareUrl };
      }
    } catch {
      /* row written under a different key (e.g. after reset); skip */
    }
  }
  return out;
}
