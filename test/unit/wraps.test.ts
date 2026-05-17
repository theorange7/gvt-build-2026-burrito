import { beforeEach, describe, expect, it } from 'vitest';
import { getWrap, listWraps, listWrapShares, saveWrap, updateWrapShare } from '@/lib/local-store/wraps';
import { db } from '@/lib/local-store/db';
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

  it('round-trips share metadata and keeps slug/url out of the plaintext row (spec 31)', async () => {
    const slug = 'abcdEFGH1234ijklMNOPqr';
    const url = `https://stwrappedtest.blob.core.windows.net/wraps/${slug}/index.html`;
    const stored = await saveWrap({
      mode: 'snapshot',
      windowStart: new Date('2025-04-01'),
      windowEnd: new Date('2025-06-30'),
      title: 'A',
      sliceContent: slices,
      shareSlug: slug,
      shareUrl: url,
    });

    const fetched = await getWrap(stored.id);
    expect(fetched?.shareSlug).toBe(slug);
    expect(fetched?.shareUrl).toBe(url);

    // Raw IndexedDB row must contain neither value in plaintext — they live
    // inside the encrypted envelope, alongside title and sliceContent.
    const raw = await db().wraps.get(stored.id);
    expect(raw).toBeDefined();
    const dump = JSON.stringify({
      mode: raw!.mode,
      windowStart: raw!.windowStart,
      windowEnd: raw!.windowEnd,
      createdAt: raw!.createdAt,
    });
    expect(dump).not.toContain(slug);
    expect(dump).not.toContain(url);
  });

  it('listWrapShares surfaces only wraps that have a share', async () => {
    const a = await saveWrap({
      mode: 'snapshot',
      windowStart: new Date('2025-04-01'),
      windowEnd: new Date('2025-06-30'),
      title: 'A',
      sliceContent: slices,
      shareSlug: 'aaaaBBBBccccDDDDeeeeFF',
      shareUrl: 'https://example.test/aaaaBBBBccccDDDDeeeeFF/index.html',
    });
    const b = await saveWrap({
      mode: 'year-end',
      windowStart: new Date('2025-01-01'),
      windowEnd: new Date('2025-12-31'),
      title: 'B',
      sliceContent: slices,
    });

    const shares = await listWrapShares();
    expect(Object.keys(shares).sort()).toEqual([a.id]);
    expect(shares[a.id].shareSlug).toBe('aaaaBBBBccccDDDDeeeeFF');
    expect(shares[b.id]).toBeUndefined();
  });

  it('updateWrapShare clears the share fields without touching the slice content', async () => {
    const stored = await saveWrap({
      mode: 'snapshot',
      windowStart: new Date('2025-04-01'),
      windowEnd: new Date('2025-06-30'),
      title: 'A',
      sliceContent: slices,
      shareSlug: 'aaaaBBBBccccDDDDeeeeFF',
      shareUrl: 'https://example.test/aaaaBBBBccccDDDDeeeeFF/index.html',
    });

    await updateWrapShare(stored.id, {});

    const fetched = await getWrap(stored.id);
    expect(fetched?.shareSlug).toBeUndefined();
    expect(fetched?.shareUrl).toBeUndefined();
    expect(fetched?.sliceContent).toEqual(slices);
    expect(fetched?.title).toBe('A');
  });

  it('updateWrapShare scrubs the prior slug/url from the raw IndexedDB row (spec 31 revoke privacy)', async () => {
    // The plaintext-column check below would catch a regression where the
    // slug or url were mistakenly promoted out of the encrypted envelope.
    // The full-row dump catches a subtler bug: a partial write that left
    // the *old* ciphertext intact would still decode to the old slug, even
    // though the StoredWrap getter would (incorrectly) report it cleared.
    // Re-encrypting under a fresh IV guarantees the rotated ciphertext is
    // byte-different from the previous one; the old slug/url string must
    // appear nowhere in the raw row.
    const slug = 'aaaaBBBBccccDDDDeeeeFF';
    const url = `https://example.test/${slug}/index.html`;
    const stored = await saveWrap({
      mode: 'snapshot',
      windowStart: new Date('2025-04-01'),
      windowEnd: new Date('2025-06-30'),
      title: 'A',
      sliceContent: slices,
      shareSlug: slug,
      shareUrl: url,
    });

    await updateWrapShare(stored.id, {});

    const raw = await db().wraps.get(stored.id);
    expect(raw).toBeDefined();

    // 1) Plaintext columns must never carry the slug/url (consistent with
    // the saveWrap envelope-contract test above).
    const plaintextDump = JSON.stringify({
      id: raw!.id,
      mode: raw!.mode,
      windowStart: raw!.windowStart,
      windowEnd: raw!.windowEnd,
      createdAt: raw!.createdAt,
    });
    expect(plaintextDump).not.toContain(slug);
    expect(plaintextDump).not.toContain(url);

    // 2) The full row, including iv + ciphertext, must not contain the
    // old slug/url substring either. Random 16-byte IVs and AES-GCM
    // ciphertext are statistically guaranteed not to coincidentally
    // contain a 22-char base64url slug — a hit here means the rotated
    // envelope still has the old payload baked in.
    const fullDump = Buffer.concat([
      Buffer.from(plaintextDump, 'utf8'),
      Buffer.from(raw!.iv),
      Buffer.from(raw!.ct),
    ]).toString('binary');
    expect(fullDump).not.toContain(slug);
    expect(fullDump).not.toContain(url);
  });
});
