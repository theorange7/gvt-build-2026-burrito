import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { generateWrap } from './generate';
import type { ContributionSource, ContributionCategory } from '@/lib/types';

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

async function run() {
  const raw = await readFile(join(process.cwd(), 'public', 'demo-contributions.json'), 'utf8');
  const rows = JSON.parse(raw) as DemoRow[];

  const contributions = rows.map((item, index) => ({
    id: `seed-${index}`,
    userId: 'local',
    source: item.source,
    category: item.category,
    signal: item.signal,
    rawData: item.rawData,
    occurredAt: new Date(item.occurredAt),
    weight: item.weight,
    externalId: item.externalId,
    externalUrl: item.externalUrl,
    createdAt: new Date(item.occurredAt),
  }));

  const tests = [
    {
      label: 'Snapshot',
      mode: 'snapshot' as const,
      windowStart: new Date(Date.UTC(2025, 3, 1)),
      windowEnd: new Date(Date.UTC(2025, 5, 30)),
    },
    {
      label: 'Year-End',
      mode: 'year-end' as const,
      windowStart: new Date(Date.UTC(2025, 0, 1)),
      windowEnd: new Date(Date.UTC(2025, 11, 31)),
    },
  ];

  for (const test of tests) {
    const startedAt = Date.now();
    const filtered = contributions.filter(
      (item) => item.occurredAt >= test.windowStart && item.occurredAt <= test.windowEnd,
    );
    const output = await generateWrap({
      contributions: filtered,
      mode: test.mode,
      windowStart: test.windowStart,
      windowEnd: test.windowEnd,
    });
    console.log(`\n=== ${test.label} (${Date.now() - startedAt}ms) ===`);
    console.dir(output, { depth: null });
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
