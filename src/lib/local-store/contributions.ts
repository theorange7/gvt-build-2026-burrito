import type { Contribution, ContributionCategory, ContributionSource } from '@/lib/types';
import { db, rowToEnvelope, type ContributionRow } from './db';
import { encryptJSON, decryptJSON } from './crypto';

type SecretPayload = {
  signal: string;
  rawData: Record<string, unknown>;
  externalUrl?: string;
  externalId?: string;
  userId: string;
};

export type AddContributionInput = {
  signal: string;
  rawData: Record<string, unknown>;
  source: ContributionSource;
  category: ContributionCategory;
  weight: number;
  occurredAt: Date;
  externalId?: string;
  externalUrl?: string;
  identityId?: string;
};

async function rowToContribution(row: ContributionRow): Promise<Contribution> {
  const secret = await decryptJSON<SecretPayload>(rowToEnvelope(row));
  return {
    id: row.id,
    userId: secret.userId,
    source: row.source,
    category: row.category as ContributionCategory,
    signal: secret.signal,
    rawData: secret.rawData,
    occurredAt: new Date(row.occurredAt),
    weight: row.weight,
    externalId: secret.externalId ?? row.externalKey,
    externalUrl: secret.externalUrl,
    identityId: row.identityId,
    createdAt: new Date(row.createdAt),
  };
}

function buildRow(
  id: string,
  input: AddContributionInput,
  createdAt: Date,
  iv: Uint8Array,
  ct: Uint8Array,
): ContributionRow {
  const row: ContributionRow = {
    id,
    occurredAt: input.occurredAt.toISOString(),
    source: input.source,
    category: input.category,
    weight: input.weight,
    createdAt: createdAt.toISOString(),
    iv,
    ct,
  };
  if (input.identityId !== undefined) row.identityId = input.identityId;
  if (input.identityId !== undefined && input.externalId !== undefined) {
    row.externalKey = input.externalId;
  }
  return row;
}

export async function addContribution(input: AddContributionInput): Promise<Contribution> {
  const id = crypto.randomUUID();
  const createdAt = new Date();
  const secret: SecretPayload = {
    signal: input.signal,
    rawData: input.rawData,
    externalUrl: input.externalUrl,
    externalId: input.externalId,
    userId: 'local',
  };
  const env = await encryptJSON(secret);
  const row = buildRow(id, input, createdAt, env.iv, env.ct);
  await db().contributions.put(row);
  return {
    id,
    userId: 'local',
    source: input.source,
    category: input.category,
    signal: input.signal,
    rawData: input.rawData,
    occurredAt: input.occurredAt,
    weight: input.weight,
    externalId: input.externalId,
    externalUrl: input.externalUrl,
    identityId: input.identityId,
    createdAt,
  };
}

export async function listContributions(): Promise<Contribution[]> {
  const rows = await db().contributions.orderBy('occurredAt').reverse().toArray();
  return Promise.all(rows.map(rowToContribution));
}

export async function listContributionsInRange(start: Date, end: Date): Promise<Contribution[]> {
  const rows = await db()
    .contributions.where('occurredAt')
    .between(start.toISOString(), end.toISOString(), true, true)
    .reverse()
    .sortBy('occurredAt');
  return Promise.all(rows.map(rowToContribution));
}

export async function deleteContribution(id: string): Promise<void> {
  await db().contributions.delete(id);
}

export async function clearContributions(): Promise<void> {
  await db().contributions.clear();
}

export async function bulkAddContributions(items: AddContributionInput[]): Promise<void> {
  const rows: ContributionRow[] = [];
  for (const item of items) {
    const id = crypto.randomUUID();
    const env = await encryptJSON({
      signal: item.signal,
      rawData: item.rawData,
      externalUrl: item.externalUrl,
      externalId: item.externalId,
      userId: 'local',
    } satisfies SecretPayload);
    rows.push(buildRow(id, item, new Date(), env.iv, env.ct));
  }
  await db().contributions.bulkPut(rows);
}

/**
 * Returns the subset of `externalIds` already present for `identityId`,
 * using the plaintext `[identityId+externalKey]` index. Used to keep
 * provider sync idempotent.
 */
export async function findExistingExternalIds(
  identityId: string,
  externalIds: ReadonlyArray<string>,
): Promise<Set<string>> {
  if (externalIds.length === 0) return new Set();
  const keys = externalIds.map((eid) => [identityId, eid] as [string, string]);
  const rows = await db()
    .contributions.where('[identityId+externalKey]')
    .anyOf(keys)
    .toArray();
  const out = new Set<string>();
  for (const row of rows) {
    if (row.externalKey) out.add(row.externalKey);
  }
  return out;
}

export async function deleteContributionsByIdentity(identityId: string): Promise<number> {
  const rows = await db().contributions.where('identityId').equals(identityId).toArray();
  await db().contributions.bulkDelete(rows.map((r) => r.id));
  return rows.length;
}
