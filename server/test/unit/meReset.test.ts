import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@azure/data-tables', async () => {
  const m = await import('../fakes/azure');
  return { TableClient: m.FakeTableClient };
});
vi.mock('@azure/identity', async () => {
  const m = await import('../fakes/azure');
  return { DefaultAzureCredential: m.FakeDefaultAzureCredential };
});

import type { HttpRequest, InvocationContext } from '@azure/functions';
import { signInstallToken } from '../../src/auth/jwt';
import { _resetRateLimitForTests } from '../../src/auth/rateLimit';
import { meReset } from '../../src/functions/meReset';
import { getTableEntities, resetAzureFakes } from '../fakes/azure';
import { putResult } from '../../src/queue/results';
import { createLookupRow, upsertJobRow } from '../../src/queue/jobs';

beforeAll(() => {
  process.env.WRAP_JWT_SECRET = 'test-secret-please-change-me';
  process.env.AZURE_TABLES_ENDPOINT = 'http://fake-tables';
  process.env.AZURE_TABLES_JOBS = 'wrapJobs';
  process.env.AZURE_TABLES_RESULTS = 'wrapResults';
});

beforeEach(() => {
  resetAzureFakes();
  _resetRateLimitForTests();
});

afterEach(() => {
  vi.clearAllMocks();
});

function makeRequest(opts: { method: string; token?: string }): HttpRequest {
  const headers = new Map<string, string>();
  if (opts.token) headers.set('authorization', `Bearer ${opts.token}`);
  return {
    method: opts.method,
    url: 'http://localhost/api/me/data',
    headers: { get: (k: string) => headers.get(k.toLowerCase()) ?? null },
    params: {},
  } as unknown as HttpRequest;
}

function makeContext(logs?: unknown[]): InvocationContext {
  return {
    error: (...args: unknown[]) => logs?.push({ level: 'error', args }),
    log: (...args: unknown[]) => logs?.push({ level: 'log', args }),
    info: () => undefined,
    warn: () => undefined,
  } as unknown as InvocationContext;
}

describe('meReset — endpoint shape', () => {
  it('returns 401 without a token', async () => {
    const res = await meReset(makeRequest({ method: 'DELETE' }), makeContext());
    expect(res.status).toBe(401);
  });

  it('returns 401 with an invalid token', async () => {
    const res = await meReset(
      makeRequest({ method: 'DELETE', token: 'not-a-real-jwt' }),
      makeContext(),
    );
    expect(res.status).toBe(401);
  });

  it('returns 204 with a valid token and no resources', async () => {
    const { token } = await signInstallToken();
    const res = await meReset(makeRequest({ method: 'DELETE', token }), makeContext());
    expect(res.status).toBe(204);
  });
});

describe('meReset — clears resources for the caller', () => {
  it('deletes jobs, results, and lookup rows and returns 204', async () => {
    const { token, installId } = await signInstallToken();
    const now = new Date().toISOString();
    const jobId = crypto.randomUUID();

    await upsertJobRow({ installId, jobId, status: 'queued', busy: false, createdAt: now, updatedAt: now });
    await putResult(installId, jobId, [{ sliceKey: 'test', headline: 'h', body: 'b' }]);
    await createLookupRow({ jobLookupToken: crypto.randomUUID(), installId, jobId });

    const res = await meReset(makeRequest({ method: 'DELETE', token }), makeContext());
    expect(res.status).toBe(204);

    expect(getTableEntities('wrapJobs').filter((e) => e.partitionKey === installId)).toHaveLength(0);
    expect(getTableEntities('wrapResults').filter((e) => e.partitionKey === installId)).toHaveLength(0);
    expect(getTableEntities('wrapJobs').filter((e) => e.partitionKey === '__lookup__' && e.installId === installId)).toHaveLength(0);
  });

  it('only removes rows owned by the calling installId', async () => {
    const { token: tokenA, installId: installA } = await signInstallToken();
    const { installId: installB } = await signInstallToken();
    const now = new Date().toISOString();

    await upsertJobRow({ installId: installA, jobId: crypto.randomUUID(), status: 'queued', busy: false, createdAt: now, updatedAt: now });
    await upsertJobRow({ installId: installB, jobId: crypto.randomUUID(), status: 'queued', busy: false, createdAt: now, updatedAt: now });

    await meReset(makeRequest({ method: 'DELETE', token: tokenA }), makeContext());

    expect(getTableEntities('wrapJobs').filter((e) => e.partitionKey === installA)).toHaveLength(0);
    expect(getTableEntities('wrapJobs').filter((e) => e.partitionKey === installB)).toHaveLength(1);
  });
});

describe('meReset — idempotency', () => {
  it('returns 204 on a second call after all resources are already gone', async () => {
    const { token } = await signInstallToken();

    const res1 = await meReset(makeRequest({ method: 'DELETE', token }), makeContext());
    const res2 = await meReset(makeRequest({ method: 'DELETE', token }), makeContext());

    expect(res1.status).toBe(204);
    expect(res2.status).toBe(204);
  });
});

describe('meReset — privacy: response body never includes identifiers', () => {
  it('207 body contains only the failed array, no installId or jobIds', async () => {
    const { token } = await signInstallToken();

    // Simulate a partial failure by spying on the jobs cleanup function.
    const jobs = await import('../../src/queue/jobs');
    const spy = vi.spyOn(jobs, 'deleteAllJobRowsForInstall').mockRejectedValueOnce(
      Object.assign(new Error('simulated table error'), { statusCode: 500 }),
    );

    const res = await meReset(makeRequest({ method: 'DELETE', token }), makeContext());

    spy.mockRestore();

    expect(res.status).toBe(207);
    const body = res.jsonBody as { failed: string[] };
    expect(body.failed).toContain('jobs');
    // Body must not leak any identifier strings
    const bodyStr = JSON.stringify(body);
    expect(bodyStr).not.toMatch(/install/i);
    expect(bodyStr).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/); // no UUID patterns
  });
});

describe('meReset — logs never contain installId', () => {
  it('no log entry contains the calling installId', async () => {
    const { token, installId } = await signInstallToken();
    const now = new Date().toISOString();
    await upsertJobRow({ installId, jobId: crypto.randomUUID(), status: 'queued', busy: false, createdAt: now, updatedAt: now });

    const logs: { level: string; args: unknown[] }[] = [];
    await meReset(makeRequest({ method: 'DELETE', token }), makeContext(logs));

    for (const entry of logs) {
      const str = JSON.stringify(entry.args);
      expect(str, `log must not contain installId`).not.toContain(installId);
    }
  });
});
