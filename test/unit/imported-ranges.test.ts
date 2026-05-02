import { beforeEach, describe, expect, it } from 'vitest';
import {
  addImportedRange,
  computeBackfillGaps,
  listImportedRanges,
} from '@/lib/local-store/importedRanges';
import { loadTestKey } from '../setup/key';

describe('local-store/importedRanges (storage)', () => {
  beforeEach(async () => {
    await loadTestKey();
  });

  it('round-trips an imported range', async () => {
    await addImportedRange('id-1', new Date('2025-01-01T00:00:00Z'), new Date('2025-03-31T23:59:59Z'));
    const all = await listImportedRanges('id-1');
    expect(all).toHaveLength(1);
    expect(all[0].identityId).toBe('id-1');
    expect(all[0].start.toISOString()).toBe('2025-01-01T00:00:00.000Z');
    expect(all[0].end.toISOString()).toBe('2025-03-31T23:59:59.000Z');
  });

  it('scopes ranges by identityId', async () => {
    await addImportedRange('id-1', new Date('2025-01-01'), new Date('2025-01-31'));
    await addImportedRange('id-2', new Date('2025-02-01'), new Date('2025-02-28'));
    expect(await listImportedRanges('id-1')).toHaveLength(1);
    expect(await listImportedRanges('id-2')).toHaveLength(1);
    expect(await listImportedRanges('missing')).toHaveLength(0);
  });
});

describe('computeBackfillGaps (pure)', () => {
  const d = (s: string) => new Date(s);

  it('returns the whole range as a single gap when no existing ranges', () => {
    const result = computeBackfillGaps([], d('2025-01-01'), d('2025-03-01'));
    expect(result.covered).toBe(false);
    expect(result.gaps).toHaveLength(1);
    expect(result.gaps[0][0].toISOString()).toBe(d('2025-01-01').toISOString());
    expect(result.gaps[0][1].toISOString()).toBe(d('2025-03-01').toISOString());
  });

  it('reports covered when one existing range fully encloses the request', () => {
    const result = computeBackfillGaps(
      [[d('2024-12-01'), d('2025-04-01')]],
      d('2025-01-01'),
      d('2025-03-01'),
    );
    expect(result.covered).toBe(true);
    expect(result.gaps).toHaveLength(0);
  });

  it('returns the trailing uncovered slice when only the head is covered', () => {
    const result = computeBackfillGaps(
      [[d('2025-01-01'), d('2025-02-15')]],
      d('2025-01-15'),
      d('2025-03-15'),
    );
    expect(result.covered).toBe(false);
    expect(result.gaps).toHaveLength(1);
    expect(result.gaps[0][0].toISOString()).toBe(d('2025-02-15').toISOString());
    expect(result.gaps[0][1].toISOString()).toBe(d('2025-03-15').toISOString());
  });

  it('returns the leading uncovered slice when only the tail is covered', () => {
    const result = computeBackfillGaps(
      [[d('2025-02-15'), d('2025-04-01')]],
      d('2025-01-15'),
      d('2025-03-15'),
    );
    expect(result.covered).toBe(false);
    expect(result.gaps).toHaveLength(1);
    expect(result.gaps[0][0].toISOString()).toBe(d('2025-01-15').toISOString());
    expect(result.gaps[0][1].toISOString()).toBe(d('2025-02-15').toISOString());
  });

  it('returns multiple gaps when interior intervals are covered', () => {
    const result = computeBackfillGaps(
      [
        [d('2025-02-01'), d('2025-02-28')],
        [d('2025-04-01'), d('2025-04-30')],
      ],
      d('2025-01-01'),
      d('2025-06-01'),
    );
    expect(result.covered).toBe(false);
    expect(result.gaps).toHaveLength(3);
    expect(result.gaps[0][0].toISOString()).toBe(d('2025-01-01').toISOString());
    expect(result.gaps[0][1].toISOString()).toBe(d('2025-02-01').toISOString());
    expect(result.gaps[1][0].toISOString()).toBe(d('2025-02-28').toISOString());
    expect(result.gaps[1][1].toISOString()).toBe(d('2025-04-01').toISOString());
    expect(result.gaps[2][0].toISOString()).toBe(d('2025-04-30').toISOString());
    expect(result.gaps[2][1].toISOString()).toBe(d('2025-06-01').toISOString());
  });

  it('treats touching intervals as continuous', () => {
    const result = computeBackfillGaps(
      [
        [d('2025-01-01'), d('2025-02-01')],
        [d('2025-02-01'), d('2025-03-01')],
      ],
      d('2025-01-15'),
      d('2025-02-15'),
    );
    expect(result.covered).toBe(true);
  });

  it('handles unsorted input by sorting internally', () => {
    const result = computeBackfillGaps(
      [
        [d('2025-04-01'), d('2025-04-30')],
        [d('2025-02-01'), d('2025-02-28')],
      ],
      d('2025-01-01'),
      d('2025-03-01'),
    );
    expect(result.gaps[0][0].toISOString()).toBe(d('2025-01-01').toISOString());
    expect(result.gaps[0][1].toISOString()).toBe(d('2025-02-01').toISOString());
  });
});
