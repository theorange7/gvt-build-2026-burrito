import type { TokenSet } from '@/lib/providers/types';
import { db, rowToEnvelope, type TokenRow } from './db';
import { decryptJSON, encryptJSON } from './crypto';

export async function putTokens(identityId: string, tokens: TokenSet): Promise<void> {
  const env = await encryptJSON(tokens);
  const existing = await db().tokens.where('identityId').equals(identityId).first();
  const row: TokenRow = {
    id: existing?.id ?? crypto.randomUUID(),
    identityId,
    iv: env.iv,
    ct: env.ct,
  };
  await db().tokens.put(row);
}

export async function getTokens(identityId: string): Promise<TokenSet | null> {
  const row = await db().tokens.where('identityId').equals(identityId).first();
  if (!row) return null;
  return decryptJSON<TokenSet>(rowToEnvelope(row));
}

export async function deleteTokens(identityId: string): Promise<void> {
  const row = await db().tokens.where('identityId').equals(identityId).first();
  if (row) await db().tokens.delete(row.id);
}
