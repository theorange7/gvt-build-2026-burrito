import { beforeEach, describe, expect, it } from 'vitest';
import { getWrap, listWraps, saveWrap } from '@/lib/local-store/wraps';
import { loadTestKey } from '../setup/key';
import type { SliceContent } from '@/lib/types';

const slices: SliceContent[] = [
  { sliceKey: 'identity', headline: 'A pattern emerges.', body: 'You ship calmly.', stat: '·' },
  { sliceKey: 'velocity', headline: 'Steady pace.', body: 'Throughput trended up.', stat: '38 PRs' },
];

describe('local-store/wraps', () => {
  beforeEach(async () => {
    await loadTestKey();
  });

  it('round-trips a saved wrap', async () => {
    const stored = await saveWrap({
      mode: 'snapshot',
      windowStart: new Date('2025-04-01'),
      windowEnd: new Date('2025-06-30'),
      title: 'Recent momentum',
      sliceContent: slices,
    });
    expect(stored.id).toMatch(/^[0-9a-f-]{36}$/);

    const fetched = await getWrap(stored.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.title).toBe('Recent momentum');
    expect(fetched?.sliceContent).toEqual(slices);
    expect(fetched?.mode).toBe('snapshot');
    expect(fetched?.windowStart.getTime()).toBe(new Date('2025-04-01').getTime());
  });

  it('returns null for an unknown wrap id', async () => {
    expect(await getWrap('does-not-exist')).toBeNull();
  });

  it('lists wraps without decrypting payload', async () => {
    await saveWrap({ mode: 'snapshot', windowStart: new Date('2025-04-01'), windowEnd: new Date('2025-04-30'), title: 'A', sliceContent: slices });
    await saveWrap({ mode: 'year-end', windowStart: new Date('2025-01-01'), windowEnd: new Date('2025-12-31'), title: 'B', sliceContent: slices });

    const list = await listWraps();
    expect(list).toHaveLength(2);
    const modes = list.map((w) => w.mode).sort();
    expect(modes).toEqual(['snapshot', 'year-end']);
  });
});
