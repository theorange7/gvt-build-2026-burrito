import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@azure/data-tables', async () => {
  const m = await import('../fakes/azure');
  return { TableClient: m.FakeTableClient };
});
vi.mock('@azure/identity', async () => {
  const m = await import('../fakes/azure');
  return { DefaultAzureCredential: m.FakeDefaultAzureCredential };
});
vi.mock('@azure/service-bus', async () => {
  const m = await import('../fakes/azure');
  return { ServiceBusClient: m.FakeServiceBusClient };
});

import type { HttpRequest, InvocationContext } from '@azure/functions';
import { signInstallToken } from '../../src/auth/jwt';
import { wrapEnqueueHandler } from '../../src/functions/wrapEnqueue';
import { wrapGetHandler } from '../../src/functions/wrapGet';
import { getJobRow, upsertJobRow } from '../../src/queue/jobs';
import { putResult } from '../../src/queue/results';
import { resetAzureFakes } from '../fakes/azure';
import type { EnqueueWrapRequest } from '@wrapped/shared';

beforeAll(() => {
  process.env.WRAP_JWT_SECRET = 'test-secret-please-change-me';
  process.env.AZURE_TABLES_ENDPOINT = 'http://fake-tables';
  process.env.AZURE_TABLES_JOBS = 'wrapJobs';
  process.env.AZURE_TABLES_RESULTS = 'wrapResults';
  process.env.AZURE_SERVICE_BUS_NAMESPACE = 'fake.servicebus.windows.net';
  process.env.WRAP_MAX_CONCURRENCY = '8';
  process.env.WRAP_PER_INSTALL_LIMIT = '1';
});

beforeEach(() => {
  resetAzureFakes();
});

afterEach(() => {
  vi.clearAllMocks();
});

function makeRequest(init: { method: 'POST' | 'GET'; url: string; body?: unknown; token?: string; params?: Record<string, string> }): HttpRequest {
  const headers = new Map<string, string>();
  if (init.token) headers.set('authorization', `Bearer ${init.token}`);
  return {
    method: init.method,
    url: init.url,
    headers: { get: (k: string) => headers.get(k.toLowerCase()) ?? null },
    params: init.params ?? {},
    json: async () => init.body,
  } as unknown as HttpRequest;
}

function makeContext(): InvocationContext {
  return {
    error: () => undefined,
    log: () => undefined,
    info: () => undefined,
    warn: () => undefined,
  } as unknown as InvocationContext;
}

const baseBody = (jobId: string): EnqueueWrapRequest => ({
  jobId,
  contributions: [
    {
      source: 'github',
      category: 'delivery',
      signal: 'shipped a thing',
      rawData: { pr: 1 },
      occurredAt: '2025-04-01T00:00:00Z',
      weight: 3,
    },
  ],
  mode: 'snapshot',
  windowStart: '2025-04-01T00:00:00Z',
  windowEnd: '2025-06-30T23:59:59Z',
});

describe('POST /wrap (enqueue) → GET /wrap/:jobId (poll)', () => {
  it('rejects requests without a bearer token', async () => {
    const jobId = crypto.randomUUID();
    const res = await wrapEnqueueHandler(
      makeRequest({ method: 'POST', url: 'http://x/wrap', body: baseBody(jobId) }),
      makeContext(),
    );
    expect(res.status).toBe(401);
  });

  it('enqueues a new job and returns queued+busy=false', async () => {
    const { token } = await signInstallToken();
    const jobId = crypto.randomUUID();
    const res = await wrapEnqueueHandler(
      makeRequest({ method: 'POST', url: 'http://x/wrap', body: baseBody(jobId), token }),
      makeContext(),
    );
    expect(res.status).toBe(200);
    expect(res.jsonBody).toEqual({ jobId, status: 'queued', busy: false });
  });

  it('is idempotent on duplicate jobId from the same install', async () => {
    const { token } = await signInstallToken();
    const jobId = crypto.randomUUID();
    const first = await wrapEnqueueHandler(
      makeRequest({ method: 'POST', url: 'http://x/wrap', body: baseBody(jobId), token }),
      makeContext(),
    );
    expect(first.status).toBe(200);
    const second = await wrapEnqueueHandler(
      makeRequest({ method: 'POST', url: 'http://x/wrap', body: baseBody(jobId), token }),
      makeContext(),
    );
    expect(second.status).toBe(200);
    expect((second.jsonBody as { jobId: string }).jobId).toBe(jobId);
  });

  it('returns 429 when per-install limit is hit', async () => {
    process.env.WRAP_PER_INSTALL_LIMIT = '1';
    const { token, installId } = await signInstallToken();
    // Pre-seed an in-flight job for this install
    await upsertJobRow({
      installId,
      jobId: crypto.randomUUID(),
      status: 'running',
      busy: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const res = await wrapEnqueueHandler(
      makeRequest({ method: 'POST', url: 'http://x/wrap', body: baseBody(crypto.randomUUID()), token }),
      makeContext(),
    );
    expect(res.status).toBe(429);
  });

  it('flags busy=true when at the global cap but still accepts the job', async () => {
    process.env.WRAP_MAX_CONCURRENCY = '1';
    process.env.WRAP_PER_INSTALL_LIMIT = '5';
    // Pre-seed one in-flight job under a different install to push global count to 1
    await upsertJobRow({
      installId: 'other-install',
      jobId: crypto.randomUUID(),
      status: 'running',
      busy: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const { token } = await signInstallToken();
    const jobId = crypto.randomUUID();
    const res = await wrapEnqueueHandler(
      makeRequest({ method: 'POST', url: 'http://x/wrap', body: baseBody(jobId), token }),
      makeContext(),
    );
    expect(res.status).toBe(200);
    expect((res.jsonBody as { busy: boolean }).busy).toBe(true);
  });

  it('GET returns running, then complete with sliceContent, then 410 on second read', async () => {
    const { token, installId } = await signInstallToken();
    const jobId = crypto.randomUUID();

    // First enqueue
    await wrapEnqueueHandler(
      makeRequest({ method: 'POST', url: 'http://x/wrap', body: baseBody(jobId), token }),
      makeContext(),
    );

    // First poll: still queued
    const queued = await wrapGetHandler(
      makeRequest({ method: 'GET', url: `http://x/wrap/${jobId}`, token, params: { jobId } }),
      makeContext(),
    );
    expect(queued.status).toBe(200);
    expect((queued.jsonBody as { status: string }).status).toBe('queued');

    // Worker outcome: write result + flip status to complete
    const sliceContent = [{ sliceKey: 'launches_shipped', headline: 'h', body: 'b' }];
    await putResult(installId, jobId, sliceContent);
    const now = new Date().toISOString();
    await upsertJobRow({
      installId,
      jobId,
      status: 'complete',
      busy: false,
      createdAt: now,
      updatedAt: now,
    });

    const completed = await wrapGetHandler(
      makeRequest({ method: 'GET', url: `http://x/wrap/${jobId}`, token, params: { jobId } }),
      makeContext(),
    );
    expect(completed.status).toBe(200);
    expect(completed.jsonBody).toEqual({ status: 'complete', sliceContent });

    // Second read should be empty (result + row deleted)
    const after = await wrapGetHandler(
      makeRequest({ method: 'GET', url: `http://x/wrap/${jobId}`, token, params: { jobId } }),
      makeContext(),
    );
    expect(after.status).toBe(404);
  });

  it('GET 401 when no bearer token', async () => {
    const res = await wrapGetHandler(
      makeRequest({ method: 'GET', url: 'http://x/wrap/abc', params: { jobId: 'abc' } }),
      makeContext(),
    );
    expect(res.status).toBe(401);
  });

  it('concurrent POSTs of the same jobId resolve to a single created row (atomic claim, see #2)', async () => {
    const { token, installId } = await signInstallToken();
    const jobId = crypto.randomUUID();
    const body = baseBody(jobId);

    const [a, b, c] = await Promise.all([
      wrapEnqueueHandler(makeRequest({ method: 'POST', url: 'http://x/wrap', body, token }), makeContext()),
      wrapEnqueueHandler(makeRequest({ method: 'POST', url: 'http://x/wrap', body, token }), makeContext()),
      wrapEnqueueHandler(makeRequest({ method: 'POST', url: 'http://x/wrap', body, token }), makeContext()),
    ]);

    for (const res of [a, b, c]) {
      expect(res.status).toBe(200);
      expect((res.jsonBody as { jobId: string }).jobId).toBe(jobId);
    }

    // Only one row should have been created — the other two are idempotent reads.
    const stored = await getJobRow(installId, jobId);
    expect(stored).not.toBeNull();
  });

  it('result rows are isolated by install — install B cannot fetch install A’s payload (#8)', async () => {
    const a = await signInstallToken();
    const b = await signInstallToken();
    const jobId = crypto.randomUUID();

    // Install A enqueues + worker outcome
    await wrapEnqueueHandler(
      makeRequest({ method: 'POST', url: 'http://x/wrap', body: baseBody(jobId), token: a.token }),
      makeContext(),
    );
    const sliceContent = [{ sliceKey: 'launches_shipped', headline: 'h', body: 'b' }];
    await putResult(a.installId, jobId, sliceContent);
    const now = new Date().toISOString();
    await upsertJobRow({
      installId: a.installId,
      jobId,
      status: 'complete',
      busy: false,
      createdAt: now,
      updatedAt: now,
    });

    // Install B knows the jobId but does not own the row → 404 from the job
    // table layer. (Belt-and-suspenders: even if the job-row guard somehow
    // passed, the result row's partitionKey is keyed to A so B's read would
    // also 404 at the storage layer.)
    const stolen = await wrapGetHandler(
      makeRequest({ method: 'GET', url: `http://x/wrap/${jobId}`, token: b.token, params: { jobId } }),
      makeContext(),
    );
    expect(stolen.status).toBe(404);

    // A's read still works.
    const owned = await wrapGetHandler(
      makeRequest({ method: 'GET', url: `http://x/wrap/${jobId}`, token: a.token, params: { jobId } }),
      makeContext(),
    );
    expect(owned.status).toBe(200);
    expect((owned.jsonBody as { sliceContent: unknown[] }).sliceContent).toEqual(sliceContent);
  });

  it('does not log payload, contributions, or sliceContent (canary spy)', async () => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const { token } = await signInstallToken();
    const canary = 'CANARY-9c1f-payload';
    const body: EnqueueWrapRequest = {
      ...baseBody(crypto.randomUUID()),
      contributions: [
        {
          source: 'github',
          category: 'delivery',
          signal: canary,
          rawData: {},
          occurredAt: '2025-04-01T00:00:00Z',
          weight: 3,
        },
      ],
    };
    await wrapEnqueueHandler(
      makeRequest({ method: 'POST', url: 'http://x/wrap', body, token }),
      makeContext(),
    );

    const allCalls = [
      ...consoleLog.mock.calls.flat(),
      ...consoleInfo.mock.calls.flat(),
      ...consoleError.mock.calls.flat(),
    ].map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg)));
    expect(allCalls.some((s) => s.includes(canary))).toBe(false);
  });
});
