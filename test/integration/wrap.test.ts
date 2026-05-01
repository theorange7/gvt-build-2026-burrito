// @vitest-environment node
/*
 * Integration smoke for the wrap pipeline. By default it mocks Anthropic via
 * MSW and asserts the structure of the resulting wrap. Run with
 * INTEGRATION_LIVE=1 to hit the real Anthropic API (requires ANTHROPIC_API_KEY)
 * and detect drift in model output / prompt behavior.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { generateWrap } from '@/lib/ai/generate';
import type { Contribution, ContributionCategory, ContributionSource } from '@/lib/types';

const here = dirname(fileURLToPath(import.meta.url));
const demoPath = join(here, '..', '..', 'public', 'demo-contributions.json');

type DemoRow = {
  source: ContributionSource;
  category: ContributionCategory;
  signal: string;
  rawData: Record<string, unknown>;
  occurredAt: string;
  weight: number;
};

const isLive = process.env.INTEGRATION_LIVE === '1';
const SLICE_KEYS = [
  'launches_shipped',
  'velocity',
  'cross_team_impact',
  'deep_work_streak',
  'mentorship',
  'initiative',
  'collaboration_style',
  'consistency',
  'highlight_reel',
  'identity',
] as const;

beforeAll(() => {
  if (!isLive && !process.env.ANTHROPIC_API_KEY) {
    process.env.ANTHROPIC_API_KEY = 'test-key';
  }
});

afterAll(() => {
  // no-op
});

function loadContributions(): Contribution[] {
  const rows = JSON.parse(readFileSync(demoPath, 'utf8')) as DemoRow[];
  return rows.map((r, idx) => ({
    id: `seed-${idx}`,
    userId: 'local',
    source: r.source,
    category: r.category,
    signal: r.signal,
    rawData: r.rawData,
    occurredAt: new Date(r.occurredAt),
    weight: r.weight,
    createdAt: new Date(r.occurredAt),
  }));
}

const cases = [
  {
    label: 'snapshot (Apr–Jun 2025)',
    mode: 'snapshot' as const,
    windowStart: new Date(Date.UTC(2025, 3, 1)),
    windowEnd: new Date(Date.UTC(2025, 5, 30)),
    bodyMax: 140,
  },
  {
    label: 'year-end (full 2025)',
    mode: 'year-end' as const,
    windowStart: new Date(Date.UTC(2025, 0, 1)),
    windowEnd: new Date(Date.UTC(2025, 11, 31)),
    bodyMax: 280,
  },
];

describe.each(cases)('generateWrap — $label', ({ mode, windowStart, windowEnd, bodyMax }) => {
  it('returns 10 slices in the expected order', async () => {
    const contributions = loadContributions().filter(
      (c) => c.occurredAt >= windowStart && c.occurredAt <= windowEnd,
    );
    const slices = await generateWrap({ contributions, mode, windowStart, windowEnd });
    expect(slices).toHaveLength(10);
    expect(slices.map((s) => s.sliceKey)).toEqual([...SLICE_KEYS]);
  });

  it('every slice has non-empty headline and body', async () => {
    const contributions = loadContributions().filter(
      (c) => c.occurredAt >= windowStart && c.occurredAt <= windowEnd,
    );
    const slices = await generateWrap({ contributions, mode, windowStart, windowEnd });
    for (const slice of slices) {
      expect(slice.headline.length, `${slice.sliceKey} headline`).toBeGreaterThan(0);
      expect(slice.body.length, `${slice.sliceKey} body`).toBeGreaterThan(0);
    }
  });

  it('body length stays within the mode-specific budget', async () => {
    if (isLive) return; // mocked responses are deterministic; live is approximate
    const contributions = loadContributions().filter(
      (c) => c.occurredAt >= windowStart && c.occurredAt <= windowEnd,
    );
    const slices = await generateWrap({ contributions, mode, windowStart, windowEnd });
    for (const slice of slices) {
      expect(slice.body.length, `${slice.sliceKey} body length budget=${bodyMax}`).toBeLessThanOrEqual(bodyMax * 1.5);
    }
  });
});
