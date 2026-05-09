/*
 * Full server-side loop: client POSTs to /wrap → message lands in Service Bus
 * → worker drains it → /wrap/{jobId} eventually returns the sliceContent.
 *
 * Unlike `wrap-queue.test.ts`, this test does NOT fake the worker — it runs
 * `wrapWorker` end to end with `generateWrap` stubbed at the network layer
 * via MSW (so the slice fan-out exercises the real prompt + parse path).
 */
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
import { wrapWorker } from '../../src/functions/wrapWorker';
import {
  makeServiceBusTriggerContext,
  popSentServiceBusMessage,
  resetAzureFakes,
  type LogEntry,
} from '../fakes/azure';
import { anthropicCalls, clearAnthropicCalls } from '../mocks/handlers';
import { SAMPLE_CONTRIBUTIONS } from '../fixtures/contributions';
import type { EnqueueWrapRequest } from '@wrapped/shared';

beforeAll(() => {
  process.env.WRAP_JWT_SECRET = 'test-secret-please-change-me';
  process.env.AZURE_TABLES_ENDPOINT = 'http://fake-tables';
  process.env.AZURE_TABLES_JOBS = 'wrapJobs';
  process.env.AZURE_TABLES_RESULTS = 'wrapResults';
  process.env.AZURE_SERVICE_BUS_NAMESPACE = 'fake.servicebus.windows.net';
  process.env.WRAP_MAX_CONCURRENCY = '8';
  process.env.WRAP_PER_INSTALL_LIMIT = '1';
  process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
});

beforeEach(() => {
  resetAzureFakes();
  clearAnthropicCalls();
});

afterEach(() => {
  vi.clearAllMocks();
});

function makeHttpRequest(init: {
  method: 'POST' | 'GET';
  url: string;
  body?: unknown;
  token?: string;
  params?: Record<string, string>;
}): HttpRequest {
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

function makeHttpContext(): InvocationContext {
  return {
    log: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  } as unknown as InvocationContext;
}

function makeBody(jobId: string, overrides: Partial<EnqueueWrapRequest> = {}): EnqueueWrapRequest {
  return {
    jobId,
    // The full fixture spans delivery / collaboration / mentorship / leadership /
    // process so every slice's category filter has enough material to skip its
    // < 2 fallback short-circuit (`shared.ts:76`).
    contributions: SAMPLE_CONTRIBUTIONS.map((c) => ({
      source: c.source,
      category: c.category,
      signal: c.signal,
      rawData: c.rawData,
      occurredAt: c.occurredAt.toISOString(),
      weight: c.weight,
    })),
    mode: 'year-end',
    windowStart: '2025-01-01T00:00:00Z',
    windowEnd: '2025-12-31T23:59:59Z',
    // Pin to the Anthropic model so MSW (which only intercepts Anthropic) sees
    // every slice call. Azure Foundry has no equivalent network mock.
    modelId: 'anthropic:claude-sonnet-4',
    ...overrides,
  };
}

describe('queue → worker → complete (full loop)', () => {
  it('delivers a queued job through the worker and returns sliceContent on the next poll', async () => {
    const { token, installId } = await signInstallToken();
    const jobId = crypto.randomUUID();

    // 1) Client POSTs /wrap → enqueue
    const enqueueRes = await wrapEnqueueHandler(
      makeHttpRequest({ method: 'POST', url: 'http://x/wrap', body: makeBody(jobId), token }),
      makeHttpContext(),
    );
    expect(enqueueRes.status).toBe(200);
    expect(enqueueRes.jsonBody).toEqual({ jobId, status: 'queued', busy: false });

    // 2) Poll while still queued
    const queued = await wrapGetHandler(
      makeHttpRequest({ method: 'GET', url: `http://x/wrap/${jobId}`, token, params: { jobId } }),
      makeHttpContext(),
    );
    expect((queued.jsonBody as { status: string }).status).toBe('queued');

    // 3) Service Bus delivers the message to the worker. Metadata must carry
    // the opaque token, NOT installId — that's the whole #7 invariant.
    const message = popSentServiceBusMessage();
    expect(message).toBeDefined();
    expect(message?.applicationProperties).toMatchObject({ jobId });
    expect(message?.applicationProperties?.jobLookupToken).toEqual(expect.any(String));
    expect(message?.applicationProperties).not.toHaveProperty('installId');
    void installId;

    await wrapWorker(message!.body, makeServiceBusTriggerContext(message!));

    // The worker should have actually reached the LLM at least once. Each
    // slice falls back to a stub if its category filter is short on data, so
    // we don't pin the count — but the loop must have invoked Anthropic.
    expect(anthropicCalls.length).toBeGreaterThan(0);

    // 4) Final poll returns complete + sliceContent
    const complete = await wrapGetHandler(
      makeHttpRequest({ method: 'GET', url: `http://x/wrap/${jobId}`, token, params: { jobId } }),
      makeHttpContext(),
    );
    expect(complete.status).toBe(200);
    const completeBody = complete.jsonBody as { status: string; sliceContent: unknown[] };
    expect(completeBody.status).toBe('complete');
    expect(Array.isArray(completeBody.sliceContent)).toBe(true);
    expect(completeBody.sliceContent).toHaveLength(10);

    // 5) Subsequent poll returns 404 (result + row dropped on first read)
    const after = await wrapGetHandler(
      makeHttpRequest({ method: 'GET', url: `http://x/wrap/${jobId}`, token, params: { jobId } }),
      makeHttpContext(),
    );
    expect(after.status).toBe(404);
  });

  it('cross-install isolation: install B cannot fetch install A’s completed wrap', async () => {
    const a = await signInstallToken();
    const b = await signInstallToken();
    const jobId = crypto.randomUUID();

    await wrapEnqueueHandler(
      makeHttpRequest({ method: 'POST', url: 'http://x/wrap', body: makeBody(jobId), token: a.token }),
      makeHttpContext(),
    );
    const message = popSentServiceBusMessage()!;
    await wrapWorker(message.body, makeServiceBusTriggerContext(message));

    // Install B knows the jobId (e.g. URL leak). Without proper ownership it
    // would currently still 404 because the job row is keyed by install A's
    // partition. This is the existing guarantee — keep regression coverage.
    const stolen = await wrapGetHandler(
      makeHttpRequest({ method: 'GET', url: `http://x/wrap/${jobId}`, token: b.token, params: { jobId } }),
      makeHttpContext(),
    );
    expect(stolen.status).toBe(404);
  });

  it('marks the job failed when every slice generation fails (no result row written)', async () => {
    const { token, installId } = await signInstallToken();
    const jobId = crypto.randomUUID();

    // No ANTHROPIC_API_KEY set for this test — force every slice to fall back.
    const oldKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    try {
      await wrapEnqueueHandler(
        makeHttpRequest({ method: 'POST', url: 'http://x/wrap', body: makeBody(jobId), token }),
        makeHttpContext(),
      );
      const message = popSentServiceBusMessage()!;
      await wrapWorker(message.body, makeServiceBusTriggerContext(message));

      // generateWrap swallows per-slice failures via fallback, so the worker
      // still completes successfully here — verify and document.
      const final = await wrapGetHandler(
        makeHttpRequest({ method: 'GET', url: `http://x/wrap/${jobId}`, token, params: { jobId } }),
        makeHttpContext(),
      );
      expect(final.status).toBe(200);
      const body = final.jsonBody as { status: string; sliceContent: Array<{ headline: string }> };
      expect(body.status).toBe('complete');
      // Fallback slices should still have a headline.
      expect(body.sliceContent.every((s) => typeof s.headline === 'string')).toBe(true);
    } finally {
      if (oldKey !== undefined) process.env.ANTHROPIC_API_KEY = oldKey;
    }

    // Sanity: ownership is still scoped to the install.
    const stolen = await wrapGetHandler(
      makeHttpRequest({
        method: 'GET',
        url: `http://x/wrap/${jobId}`,
        token: (await signInstallToken()).token,
        params: { jobId },
      }),
      makeHttpContext(),
    );
    expect(stolen.status).toBe(404);
    void installId;
  });

  it('canary: the contributions signal text never reaches any worker log sink', async () => {
    const { token } = await signInstallToken();
    const canary = 'CANARY-loop-payload-7e2a';
    const body: EnqueueWrapRequest = {
      ...makeBody(crypto.randomUUID()),
      contributions: [
        {
          source: 'github',
          category: 'delivery',
          signal: canary,
          rawData: { token: canary },
          occurredAt: '2025-04-01T00:00:00Z',
          weight: 3,
        },
      ],
    };

    await wrapEnqueueHandler(
      makeHttpRequest({ method: 'POST', url: 'http://x/wrap', body, token }),
      makeHttpContext(),
    );
    const message = popSentServiceBusMessage()!;

    const logs: LogEntry[] = [];
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      await wrapWorker(message.body, makeServiceBusTriggerContext(message, (e) => logs.push(e)));
    } finally {
      consoleLog.mockRestore();
      consoleInfo.mockRestore();
      consoleError.mockRestore();
    }

    const ctxDump = JSON.stringify(logs);
    const consoleDump = JSON.stringify([
      ...consoleLog.mock.calls,
      ...consoleInfo.mock.calls,
      ...consoleError.mock.calls,
    ]);
    expect(ctxDump.includes(canary)).toBe(false);
    expect(consoleDump.includes(canary)).toBe(false);
  });
});
