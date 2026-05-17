import { beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { db, META_KEYS } from '@/lib/local-store/db';
import { resetLocalState } from '@/lib/local-store/reset';
import * as aiReset from '@/lib/ai/reset';
import { loadTestKey } from '../setup/key';

const BACKEND = 'http://localhost:7071/api';

beforeEach(async () => {
  process.env.NEXT_PUBLIC_WRAP_API_URL = BACKEND;
  await loadTestKey();
});

async function seedDb() {
  const now = new Date().toISOString();
  const salt = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
  await db().meta.put({ key: META_KEYS.kdfSalt, value: salt });
  await db().meta.put({ key: META_KEYS.wrapInstallToken, value: { token: 'test-token', expiresAt: 9999999999 } });
  await db().identities.put({ id: 'id-1', providerId: 'gitlab', instanceUrl: 'https://gl.example.com', externalUserId: 'u1', iv: new Uint8Array(12), ct: new Uint8Array(32) });
  await db().pendingWrapRequests.put({ id: 'pr-1', mode: 'snapshot', windowStart: now, windowEnd: now, requestedAt: now, status: 'queued', busy: 0 });
}

describe('resetLocalState — mode A (clear-data)', () => {
  it('clears all data tables but keeps meta rows on 204', async () => {
    server.use(
      http.delete(`${BACKEND}/me/data`, () => new HttpResponse(null, { status: 204 })),
    );

    await seedDb();
    const result = await resetLocalState('clear-data');

    expect(result.serverCleanup).toBe('ok');
    expect(await db().identities.count()).toBe(0);
    expect(await db().pendingWrapRequests.count()).toBe(0);

    // meta rows survive in mode A
    const salt = await db().meta.get(META_KEYS.kdfSalt);
    const token = await db().meta.get(META_KEYS.wrapInstallToken);
    expect(salt).toBeDefined();
    expect(token).toBeDefined();
  });

  it('aborts local wipe and returns offline when server fails', async () => {
    server.use(
      http.delete(`${BACKEND}/me/data`, () => new HttpResponse(null, { status: 503 })),
    );

    await seedDb();
    const result = await resetLocalState('clear-data');

    expect(result.serverCleanup).toBe('offline');

    // Local data must be untouched
    expect(await db().identities.count()).toBe(1);
    expect(await db().meta.get(META_KEYS.kdfSalt)).toBeDefined();
  });

  it('reports partial server cleanup when deleteServerData returns partial', async () => {
    const spy = vi.spyOn(aiReset, 'deleteServerData').mockResolvedValueOnce({
      partial: true,
      failed: ['shares'],
    });

    await seedDb();
    const result = await resetLocalState('clear-data');

    spy.mockRestore();

    expect(result.serverCleanup).toBe('partial');
    expect(result.failedResources).toContain('shares');
    // Local data is still wiped for partial server success
    expect(await db().identities.count()).toBe(0);
  });
});

describe('resetLocalState — mode B (forget-device)', () => {
  it('clears all tables including meta rows on 204', async () => {
    server.use(
      http.delete(`${BACKEND}/me/data`, () => new HttpResponse(null, { status: 204 })),
    );

    await seedDb();

    // mock reload so the test doesn't break
    const reloadSpy = vi.spyOn(window, 'location', 'get').mockReturnValue({
      ...window.location,
      reload: vi.fn(),
    });

    await resetLocalState('forget-device');

    expect(await db().identities.count()).toBe(0);
    expect(await db().meta.get(META_KEYS.kdfSalt)).toBeUndefined();
    expect(await db().meta.get(META_KEYS.wrapInstallToken)).toBeUndefined();

    reloadSpy.mockRestore();
  });

  it('returns offline without wiping when server fails and proceedLocalOnly not set', async () => {
    server.use(
      http.delete(`${BACKEND}/me/data`, () => new HttpResponse(null, { status: 503 })),
    );

    await seedDb();
    const result = await resetLocalState('forget-device');

    expect(result.serverCleanup).toBe('offline');
    // Local data untouched — caller must re-invoke with proceedLocalOnly
    expect(await db().identities.count()).toBe(1);
    expect(await db().meta.get(META_KEYS.kdfSalt)).toBeDefined();
  });

  it('wipes local data including meta rows when proceedLocalOnly is true', async () => {
    await seedDb();

    const reloadSpy = vi.spyOn(window, 'location', 'get').mockReturnValue({
      ...window.location,
      reload: vi.fn(),
    });

    const result = await resetLocalState('forget-device', { proceedLocalOnly: true });

    expect(result.serverCleanup).toBe('offline');
    expect(await db().identities.count()).toBe(0);
    expect(await db().meta.get(META_KEYS.kdfSalt)).toBeUndefined();
    expect(await db().meta.get(META_KEYS.wrapInstallToken)).toBeUndefined();

    reloadSpy.mockRestore();
  });
});
