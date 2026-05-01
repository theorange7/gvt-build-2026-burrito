import { beforeEach, describe, expect, it } from 'vitest';
import {
  addContribution,
  bulkAddContributions,
  clearContributions,
  deleteContribution,
  listContributions,
  listContributionsInRange,
} from '@/lib/local-store/contributions';
import { loadTestKey } from '../setup/key';
import { SAMPLE_CONTRIBUTIONS } from '../fixtures/contributions';

describe('local-store/contributions', () => {
  beforeEach(async () => {
    await loadTestKey();
  });

  it('round-trips a contribution through encrypted storage', async () => {
    const input = SAMPLE_CONTRIBUTIONS[0];
    const created = await addContribution(input);

    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(created.signal).toBe(input.signal);
    expect(created.rawData).toEqual(input.rawData);
    expect(created.externalUrl).toBe(input.externalUrl);

    const list = await listContributions();
    expect(list).toHaveLength(1);
    expect(list[0].signal).toBe(input.signal);
    expect(list[0].rawData).toEqual(input.rawData);
    expect(list[0].source).toBe(input.source);
    expect(list[0].category).toBe(input.category);
    expect(list[0].weight).toBe(input.weight);
    expect(list[0].occurredAt.getTime()).toBe(input.occurredAt.getTime());
  });

  it('orders listContributions by occurredAt descending', async () => {
    await bulkAddContributions(SAMPLE_CONTRIBUTIONS);
    const list = await listContributions();
    expect(list).toHaveLength(SAMPLE_CONTRIBUTIONS.length);
    for (let i = 1; i < list.length; i += 1) {
      expect(list[i - 1].occurredAt.getTime()).toBeGreaterThanOrEqual(list[i].occurredAt.getTime());
    }
  });

  it('filters by date range inclusively', async () => {
    await bulkAddContributions(SAMPLE_CONTRIBUTIONS);
    const filtered = await listContributionsInRange(
      new Date('2025-04-01T00:00:00Z'),
      new Date('2025-09-30T23:59:59Z'),
    );
    const signals = filtered.map((c) => c.signal);
    expect(signals).toHaveLength(3);
    expect(signals).toEqual(
      expect.arrayContaining([
        SAMPLE_CONTRIBUTIONS[2].signal,
        SAMPLE_CONTRIBUTIONS[3].signal,
        SAMPLE_CONTRIBUTIONS[4].signal,
      ]),
    );
  });

  it('deletes a single contribution', async () => {
    const a = await addContribution(SAMPLE_CONTRIBUTIONS[0]);
    await addContribution(SAMPLE_CONTRIBUTIONS[1]);
    await deleteContribution(a.id);
    const list = await listContributions();
    expect(list).toHaveLength(1);
    expect(list[0].signal).toBe(SAMPLE_CONTRIBUTIONS[1].signal);
  });

  it('clears all contributions', async () => {
    await bulkAddContributions(SAMPLE_CONTRIBUTIONS);
    await clearContributions();
    expect(await listContributions()).toHaveLength(0);
  });

  it('does not leak rawData between rows on bulk insert', async () => {
    await bulkAddContributions([
      { ...SAMPLE_CONTRIBUTIONS[0], rawData: { uniqueA: 'A' } },
      { ...SAMPLE_CONTRIBUTIONS[1], rawData: { uniqueB: 'B' } },
    ]);
    const list = await listContributions();
    const a = list.find((c) => c.signal === SAMPLE_CONTRIBUTIONS[0].signal);
    const b = list.find((c) => c.signal === SAMPLE_CONTRIBUTIONS[1].signal);
    expect(a?.rawData).toEqual({ uniqueA: 'A' });
    expect(b?.rawData).toEqual({ uniqueB: 'B' });
  });
});
