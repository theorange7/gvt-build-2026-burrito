/**
 * Emulator integration suite — requires Azurite and the Azure Service Bus
 * emulator to be running (docker compose up -d from the repo root). Run with:
 *
 *   EMULATOR=1 pnpm --filter server test -- integration/emulator
 *
 * LLM calls are intentionally skipped (no ANTHROPIC_API_KEY). Every slice
 * falls back to a stub via generateWrap's Promise.allSettled fan-out so the
 * suite exercises real Table Storage and Service Bus integration without
 * needing an AI key.
 *
 * If your Service Bus emulator uses a different SAS key, set:
 *   EMULATOR_SB_CONNECTION="Endpoint=sb://localhost;...;UseDevelopmentEmulator=true;"
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { TableClient, TableServiceClient } from '@azure/data-tables';
import { ServiceBusClient } from '@azure/service-bus';
import type { HttpRequest, InvocationContext } from '@azure/functions';
import type { EnqueueWrapRequest } from '@wrapped/shared';
import { signInstallToken } from '../../../src/auth/jwt';
import { wrapEnqueueHandler } from '../../../src/functions/wrapEnqueue';
import { wrapGetHandler } from '../../../src/functions/wrapGet';
import { wrapWorker } from '../../../src/functions/wrapWorker';
import { _setJobsClientForTests } from '../../../src/queue/jobs';
import { _setResultsClientForTests } from '../../../src/queue/results';
import { _setSenderForTests } from '../../../src/queue/serviceBus';
import { server } from '../../mocks/server';
import { SAMPLE_CONTRIBUTIONS } from '../../fixtures/contributions';

// Azurite's well-known devstoreaccount1 connection string — never changes.
const AZURITE_CS =
  'DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;' +
  'AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;' +
  'TableEndpoint=http://127.0.0.1:10002/devstoreaccount1;';

// Service Bus emulator — override via EMULATOR_SB_CONNECTION if your emulator
// uses a different SAS key. UseDevelopmentEmulator=true disables SAS validation.
const SB_CS =
  process.env.EMULATOR_SB_CONNECTION ??
  'Endpoint=sb://localhost:5672;SharedAccessKeyName=RootManageSharedAccessKey;' +
  'SharedAccessKey=SAS_KEY_VALUE;UseDevelopmentEmulator=true;';

const QUEUE_NAME = process.env.AZURE_SERVICE_BUS_QUEUE_NAME ?? 'wrap-jobs';

// Dedicated test table names so this suite can coexist with a running func start.
const JOBS_TABLE = 'wrapJobsEmTest';
const RESULTS_TABLE = 'wrapResultsEmTest';

describe.skipIf(!process.env.EMULATOR)('emulator — wrap pipeline', () => {
  let sbClient: ServiceBusClient;
  let jobsClient: TableClient;
  let resultsClient: TableClient;

  // ── Helpers ──────────────────────────────────────────────────────────────

  function makeRequest(init: {
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

  function makeCtx(): InvocationContext {
    return {
      log: () => undefined,
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
    } as unknown as InvocationContext;
  }

  function workerCtxFromMessage(msg: { applicationProperties?: Record<string, unknown> }): InvocationContext {
    return {
      log: () => undefined,
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
      triggerMetadata: {
        applicationProperties: msg.applicationProperties ?? {},
        deliveryCount: 1,
      },
    } as unknown as InvocationContext;
  }

  function makeBody(jobId: string, overrides: Partial<EnqueueWrapRequest> = {}): EnqueueWrapRequest {
    return {
      jobId,
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
      ...overrides,
    };
  }

  async function drainQueue(): Promise<void> {
    const receiver = sbClient.createReceiver(QUEUE_NAME, { receiveMode: 'receiveAndDelete' });
    try {
      let batch = await receiver.receiveMessages(50, { maxWaitTimeInMs: 1_000 });
      while (batch.length > 0) {
        batch = await receiver.receiveMessages(50, { maxWaitTimeInMs: 500 });
      }
    } finally {
      await receiver.close();
    }
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  beforeAll(async () => {
    // Stop MSW so HTTP calls to Azurite (127.0.0.1:10002) pass through.
    server.close();

    process.env.WRAP_JWT_SECRET = 'emulator-test-secret';
    process.env.WRAP_MAX_CONCURRENCY = '8';
    process.env.WRAP_PER_INSTALL_LIMIT = '4';
    process.env.AZURE_TABLES_JOBS = JOBS_TABLE;
    process.env.AZURE_TABLES_RESULTS = RESULTS_TABLE;
    process.env.AZURE_SERVICE_BUS_QUEUE_NAME = QUEUE_NAME;
    // No ANTHROPIC_API_KEY — slices fall back, job still resolves 'complete'.
    delete process.env.ANTHROPIC_API_KEY;

    // Create test tables (idempotent).
    const svc = TableServiceClient.fromConnectionString(AZURITE_CS, { allowInsecureConnection: true });
    await svc.createTable(JOBS_TABLE).catch(() => undefined);
    await svc.createTable(RESULTS_TABLE).catch(() => undefined);

    // Inject real Table Storage clients, bypassing the ENV_MODE check in
    // jobs.ts / results.ts so there's no need to override the connection string
    // env var that global.ts already set to a fake value.
    jobsClient = TableClient.fromConnectionString(AZURITE_CS, JOBS_TABLE, { allowInsecureConnection: true });
    resultsClient = TableClient.fromConnectionString(AZURITE_CS, RESULTS_TABLE, { allowInsecureConnection: true });
    _setJobsClientForTests(jobsClient);
    _setResultsClientForTests(resultsClient);

    // Inject a real Service Bus sender.
    sbClient = new ServiceBusClient(SB_CS);
    _setSenderForTests(sbClient.createSender(QUEUE_NAME));
  }, 30_000);

  afterAll(async () => {
    _setJobsClientForTests(null);
    _setResultsClientForTests(null);
    _setSenderForTests(null);

    const svc = TableServiceClient.fromConnectionString(AZURITE_CS, { allowInsecureConnection: true });
    await svc.deleteTable(JOBS_TABLE).catch(() => undefined);
    await svc.deleteTable(RESULTS_TABLE).catch(() => undefined);

    await sbClient.close();
  });

  beforeEach(async () => {
    // Wipe table rows so each test starts from a clean slate.
    for await (const e of jobsClient.listEntities<{ partitionKey: string; rowKey: string }>()) {
      await jobsClient.deleteEntity(e.partitionKey, e.rowKey).catch(() => undefined);
    }
    for await (const e of resultsClient.listEntities<{ partitionKey: string; rowKey: string }>()) {
      await resultsClient.deleteEntity(e.partitionKey, e.rowKey).catch(() => undefined);
    }
    await drainQueue();
  }, 15_000);

  // ── Tests ─────────────────────────────────────────────────────────────────

  it('enqueue writes a job row and poll returns queued', async () => {
    const { token } = await signInstallToken();
    const jobId = crypto.randomUUID();

    const enqueueRes = await wrapEnqueueHandler(
      makeRequest({ method: 'POST', url: 'http://x/wrap', body: makeBody(jobId), token }),
      makeCtx(),
    );
    expect(enqueueRes.status).toBe(200);
    expect(enqueueRes.jsonBody).toMatchObject({ jobId, status: 'queued' });

    const pollRes = await wrapGetHandler(
      makeRequest({ method: 'GET', url: `http://x/wrap/${jobId}`, token, params: { jobId } }),
      makeCtx(),
    );
    expect(pollRes.status).toBe(200);
    expect((pollRes.jsonBody as { status: string }).status).toBe('queued');
  });

  it('unauthenticated enqueue is rejected with 401', async () => {
    const res = await wrapEnqueueHandler(
      makeRequest({ method: 'POST', url: 'http://x/wrap', body: makeBody(crypto.randomUUID()) }),
      makeCtx(),
    );
    expect(res.status).toBe(401);
  });

  it('full pipeline: enqueue → Service Bus message → worker → complete', async () => {
    const { token } = await signInstallToken();
    const jobId = crypto.randomUUID();

    // 1. Enqueue — message lands in the real Service Bus emulator.
    const enqueueRes = await wrapEnqueueHandler(
      makeRequest({ method: 'POST', url: 'http://x/wrap', body: makeBody(jobId), token }),
      makeCtx(),
    );
    expect(enqueueRes.status).toBe(200);

    // 2. Receive the message from the emulator queue.
    const receiver = sbClient.createReceiver(QUEUE_NAME, { receiveMode: 'receiveAndDelete' });
    let messages;
    try {
      messages = await receiver.receiveMessages(1, { maxWaitTimeInMs: 10_000 });
    } finally {
      await receiver.close();
    }
    expect(messages).toHaveLength(1);
    const msg = messages[0];
    expect(msg.applicationProperties?.jobId).toBe(jobId);
    expect(msg.applicationProperties?.jobLookupToken).toEqual(expect.any(String));

    // 3. Run the worker. No LLM key → every slice falls back; still completes.
    await wrapWorker(msg.body, workerCtxFromMessage(msg));

    // 4. First poll returns complete with 10 slices.
    const completeRes = await wrapGetHandler(
      makeRequest({ method: 'GET', url: `http://x/wrap/${jobId}`, token, params: { jobId } }),
      makeCtx(),
    );
    expect(completeRes.status).toBe(200);
    const completeBody = completeRes.jsonBody as { status: string; sliceContent: unknown[] };
    expect(completeBody.status).toBe('complete');
    expect(Array.isArray(completeBody.sliceContent)).toBe(true);
    expect(completeBody.sliceContent).toHaveLength(10);

    // 5. Second poll 404 — result + job rows are dropped on first read.
    const secondRes = await wrapGetHandler(
      makeRequest({ method: 'GET', url: `http://x/wrap/${jobId}`, token, params: { jobId } }),
      makeCtx(),
    );
    expect(secondRes.status).toBe(404);
  }, 60_000);

  it("cross-install isolation: install B cannot read install A's result", async () => {
    const a = await signInstallToken();
    const b = await signInstallToken();
    const jobId = crypto.randomUUID();

    await wrapEnqueueHandler(
      makeRequest({ method: 'POST', url: 'http://x/wrap', body: makeBody(jobId), token: a.token }),
      makeCtx(),
    );

    const receiver = sbClient.createReceiver(QUEUE_NAME, { receiveMode: 'receiveAndDelete' });
    let messages;
    try {
      messages = await receiver.receiveMessages(1, { maxWaitTimeInMs: 10_000 });
    } finally {
      await receiver.close();
    }
    await wrapWorker(messages[0].body, workerCtxFromMessage(messages[0]));

    // Install B knows the jobId but doesn't own the row — must get 404.
    const stolen = await wrapGetHandler(
      makeRequest({ method: 'GET', url: `http://x/wrap/${jobId}`, token: b.token, params: { jobId } }),
      makeCtx(),
    );
    expect(stolen.status).toBe(404);

    // Install A can read their own result.
    const owned = await wrapGetHandler(
      makeRequest({ method: 'GET', url: `http://x/wrap/${jobId}`, token: a.token, params: { jobId } }),
      makeCtx(),
    );
    expect(owned.status).toBe(200);
    expect((owned.jsonBody as { status: string }).status).toBe('complete');
  }, 60_000);

  it('idempotent enqueue: duplicate jobId returns the existing row', async () => {
    const { token } = await signInstallToken();
    const jobId = crypto.randomUUID();

    const first = await wrapEnqueueHandler(
      makeRequest({ method: 'POST', url: 'http://x/wrap', body: makeBody(jobId), token }),
      makeCtx(),
    );
    expect(first.status).toBe(200);

    const second = await wrapEnqueueHandler(
      makeRequest({ method: 'POST', url: 'http://x/wrap', body: makeBody(jobId), token }),
      makeCtx(),
    );
    expect(second.status).toBe(200);
    expect((second.jsonBody as { jobId: string }).jobId).toBe(jobId);
  });
});
