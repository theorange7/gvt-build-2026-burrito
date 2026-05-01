import type { ContributionCategory, ContributionSource } from '@/lib/types';
import { bulkAddContributions, clearContributions } from './contributions';
import { db, META_KEYS } from './db';

type DemoRow = {
  source: ContributionSource;
  category: ContributionCategory;
  signal: string;
  rawData: Record<string, unknown>;
  occurredAt: string;
  weight: number;
  externalId?: string;
  externalUrl?: string;
};

export async function isSeeded(): Promise<boolean> {
  const row = await db().meta.get(META_KEYS.seeded);
  return Boolean(row?.value);
}

export async function markSeeded(): Promise<void> {
  await db().meta.put({ key: META_KEYS.seeded, value: true });
}

export async function seedFromBundledDemo(): Promise<number> {
  const response = await fetch('/demo-contributions.json');
  if (!response.ok) throw new Error('Failed to load demo data.');
  const rows = (await response.json()) as DemoRow[];
  await clearContributions();
  await bulkAddContributions(
    rows.map((r) => ({
      source: r.source,
      category: r.category,
      signal: r.signal,
      rawData: r.rawData,
      occurredAt: new Date(r.occurredAt),
      weight: r.weight,
      externalId: r.externalId,
      externalUrl: r.externalUrl,
    })),
  );
  await markSeeded();
  return rows.length;
}
