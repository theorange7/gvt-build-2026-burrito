// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { createSlice, fallbackForSlice, filterContributions, formatContributionList, modeInstruction } from './shared';
import type { Contribution } from '@/lib/types';

vi.mock('./client', () => ({
  callClaude: vi.fn(),
}));

import { callClaude } from './client';

const mockedCallClaude = vi.mocked(callClaude);

const contributions: Contribution[] = [
  {
    id: '1',
    userId: 'demo-user',
    source: 'github',
    category: 'delivery',
    signal: 'Shipped the permits dashboard.',
    rawData: {},
    occurredAt: new Date('2025-05-20T00:00:00.000Z'),
    weight: 5,
    createdAt: new Date('2025-05-20T00:00:00.000Z'),
  },
  {
    id: '2',
    userId: 'demo-user',
    source: 'slack',
    category: 'collaboration',
    signal: 'Coordinated review across two teams.',
    rawData: {},
    occurredAt: new Date('2025-05-18T00:00:00.000Z'),
    weight: 3,
    createdAt: new Date('2025-05-18T00:00:00.000Z'),
  },
  {
    id: '3',
    userId: 'demo-user',
    source: 'manual',
    category: 'delivery',
    signal: 'Documented the migration plan.',
    rawData: {},
    occurredAt: new Date('2025-05-01T00:00:00.000Z'),
    weight: 2,
    createdAt: new Date('2025-05-01T00:00:00.000Z'),
  },
];

describe('shared AI helpers', () => {
  it('returns the correct mode instruction', () => {
    expect(modeInstruction('snapshot')).toMatch(/Punchy/);
    expect(modeInstruction('year-end')).toMatch(/Editorial/);
  });

  it('filters contributions by category, weight, and recency', () => {
    expect(filterContributions(contributions, ['delivery'], { minWeight: 3, limit: 1 })).toEqual([
      contributions[0],
    ]);
  });

  it('formats contributions into weighted prompt lines', () => {
    const formatted = formatContributionList([contributions[0]]);

    expect(formatted).toContain('[weight:5]');
    expect(formatted).toContain('Shipped the permits dashboard.');
  });

  it('returns a fallback slice when there are too few contributions', async () => {
    await expect(
      createSlice({
        sliceKey: 'velocity',
        sliceName: 'Velocity',
        coverage: 'How quickly work moved.',
        mode: 'snapshot',
        contributions: [contributions[0]],
        categories: 'all',
        statHint: '3 launches',
      }),
    ).resolves.toEqual(fallbackForSlice('velocity'));
  });

  it('returns a fallback slice when the model payload is invalid', async () => {
    mockedCallClaude.mockResolvedValue('{invalid json');

    await expect(
      createSlice({
        sliceKey: 'velocity',
        sliceName: 'Velocity',
        coverage: 'How quickly work moved.',
        mode: 'snapshot',
        contributions,
        categories: 'all',
        statHint: '3 launches',
      }),
    ).resolves.toEqual(fallbackForSlice('velocity'));
  });
});
