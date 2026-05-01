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
};

async function rowToContribution(row: ContributionRow): Promise<Contribution> {
  const secret = await decryptJSON<SecretPayload>(rowToEnvelope(row));
  return {
    id: row.id,
    userId: secret.userId,
    source: row.source as ContributionSource,
    category: row.category as ContributionCategory,
    signal: secret.signal,
    rawData: secret.rawData,
    occurredAt: new Date(row.occurredAt),
    weight: row.weight,
    externalId: secret.externalId,
    externalUrl: secret.externalUrl,
    createdAt: new Date(row.createdAt),
  };
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
  const row: ContributionRow = {
    id,
    occurredAt: input.occurredAt.toISOString(),
    source: input.source,
    category: input.category,
    weight: input.weight,
    createdAt: createdAt.toISOString(),
    iv: env.iv,
    ct: env.ct,
  };
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
    rows.push({
      id,
      occurredAt: item.occurredAt.toISOString(),
      source: item.source,
      category: item.category,
      weight: item.weight,
      createdAt: new Date().toISOString(),
      iv: env.iv,
      ct: env.ct,
    });
  }
  await db().contributions.bulkPut(rows);
}
