import { db, rowToEnvelope, type IdentityRow } from './db';
import { decryptJSON, encryptJSON } from './crypto';

export type IdentityProfileSecret = {
  username?: string;
  email?: string;
  displayName?: string;
  raw?: unknown;
  addedAt: number;
};

export type StoredIdentity = {
  id: string;
  providerId: string;
  instanceUrl: string;
  externalUserId: string;
  username?: string;
  email?: string;
  displayName?: string;
  raw?: unknown;
  addedAt: number;
};

export type UpsertIdentityInput = {
  providerId: string;
  instanceUrl: string;
  externalUserId: string;
  username?: string;
  email?: string;
  displayName?: string;
  raw?: unknown;
};

async function rowToIdentity(row: IdentityRow): Promise<StoredIdentity> {
  const secret = await decryptJSON<IdentityProfileSecret>(rowToEnvelope(row));
  return {
    id: row.id,
    providerId: row.providerId,
    instanceUrl: row.instanceUrl,
    externalUserId: row.externalUserId,
    username: secret.username,
    email: secret.email,
    displayName: secret.displayName,
    raw: secret.raw,
    addedAt: secret.addedAt,
  };
}

export async function upsertIdentity(input: UpsertIdentityInput): Promise<StoredIdentity> {
  const existing = await db()
    .identities.where('[providerId+instanceUrl+externalUserId]')
    .equals([input.providerId, input.instanceUrl, input.externalUserId])
    .first();

  const existingSecret = existing
    ? await decryptJSON<IdentityProfileSecret>(rowToEnvelope(existing))
    : null;

  const profile: IdentityProfileSecret = {
    username: input.username,
    email: input.email,
    displayName: input.displayName,
    raw: input.raw,
    addedAt: existingSecret?.addedAt ?? Date.now(),
  };
  const env = await encryptJSON(profile);

  const id = existing?.id ?? crypto.randomUUID();
  const row: IdentityRow = {
    id,
    providerId: input.providerId,
    instanceUrl: input.instanceUrl,
    externalUserId: input.externalUserId,
    iv: env.iv,
    ct: env.ct,
  };
  await db().identities.put(row);

  return {
    id,
    providerId: input.providerId,
    instanceUrl: input.instanceUrl,
    externalUserId: input.externalUserId,
    username: input.username,
    email: input.email,
    displayName: input.displayName,
    raw: input.raw,
    addedAt: profile.addedAt,
  };
}

export async function getIdentity(id: string): Promise<StoredIdentity | null> {
  const row = await db().identities.get(id);
  if (!row) return null;
  return rowToIdentity(row);
}

export async function findIdentity(
  providerId: string,
  instanceUrl: string,
  externalUserId: string,
): Promise<StoredIdentity | null> {
  const row = await db()
    .identities.where('[providerId+instanceUrl+externalUserId]')
    .equals([providerId, instanceUrl, externalUserId])
    .first();
  if (!row) return null;
  return rowToIdentity(row);
}

export async function listIdentities(): Promise<StoredIdentity[]> {
  const rows = await db().identities.toArray();
  return Promise.all(rows.map(rowToIdentity));
}

export async function deleteIdentity(id: string): Promise<void> {
  await db().identities.delete(id);
}
