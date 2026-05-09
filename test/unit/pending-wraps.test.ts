import { afterEach, describe, expect, it } from 'vitest';
import {
  addPendingWrap,
  getPendingWrap,
  listPendingWraps,
  removePendingWrap,
  updatePendingWrap,
} from '@/lib/local-store/pendingWraps';
import { db } from '@/lib/local-store/db';

afterEach(async () => {
  await db().pendingWrapRequests.clear();
});

describe('local-store/pendingWraps', () => {
  it('round-trips through add/get with date and busy-bool fidelity', async () => {
    const id = crypto.randomUUID();
    const requestedAt = new Date('2025-04-01T10:00:00Z');
    await addPendingWrap({
      id,
      mode: 'snapshot',
      windowStart: new Date('2025-04-01T00:00:00Z'),
      windowEnd: new Date('2025-06-30T23:59:59Z'),
      requestedAt,
      status: 'queued',
      busy: true,
      modelId: 'azure:claude-haiku-4-5',
    });
    const out = await getPendingWrap(id);
    expect(out).toMatchObject({
      id,
      mode: 'snapshot',
      status: 'queued',
      busy: true,
      modelId: 'azure:claude-haiku-4-5',
    });
    expect(out?.requestedAt.toISOString()).toBe(requestedAt.toISOString());
  });

  it('updates status, busy, and lastCheckedAt', async () => {
    const id = crypto.randomUUID();
    await addPendingWrap({
      id,
      mode: 'year-end',
      windowStart: new Date('2025-01-01'),
      windowEnd: new Date('2025-12-31'),
      requestedAt: new Date(),
      status: 'queued',
      busy: false,
    });
    const checked = new Date('2025-04-02T11:00:00Z');
    await updatePendingWrap(id, { status: 'running', busy: true, lastCheckedAt: checked });
    const out = await getPendingWrap(id);
    expect(out?.status).toBe('running');
    expect(out?.busy).toBe(true);
    expect(out?.lastCheckedAt?.toISOString()).toBe(checked.toISOString());
  });

  it('listPendingWraps returns every row', async () => {
    await addPendingWrap({
      id: 'a',
      mode: 'snapshot',
      windowStart: new Date(),
      windowEnd: new Date(),
      requestedAt: new Date(),
      status: 'queued',
      busy: false,
    });
    await addPendingWrap({
      id: 'b',
      mode: 'year-end',
      windowStart: new Date(),
      windowEnd: new Date(),
      requestedAt: new Date(),
      status: 'running',
      busy: true,
    });
    const list = await listPendingWraps();
    expect(list.map((p) => p.id).sort()).toEqual(['a', 'b']);
  });

  it('removePendingWrap deletes the row', async () => {
    const id = crypto.randomUUID();
    await addPendingWrap({
      id,
      mode: 'snapshot',
      windowStart: new Date(),
      windowEnd: new Date(),
      requestedAt: new Date(),
      status: 'queued',
      busy: false,
    });
    expect(await getPendingWrap(id)).not.toBeNull();
    await removePendingWrap(id);
    expect(await getPendingWrap(id)).toBeNull();
  });
});
