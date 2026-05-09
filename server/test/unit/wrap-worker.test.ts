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

vi.mock('../../src/ai/generate', () => ({
  generateWrap: vi.fn(),
}));

import type { EnqueueWrapRequest, SliceContent } from '@wrapped/shared';
import { wrapWorker } from '../../src/functions/wrapWorker';
import { generateWrap } from '../../src/ai/generate';
import { getJobRow, upsertJobRow } from '../../src/queue/jobs';
import { getAndDeleteResult } from '../../src/queue/results';
import {
  getTableEntities,
  makeServiceBusTriggerContext,
  resetAzureFakes,
  type LogEntry,
  type SentServiceBusMessage,
} from '../fakes/azure';

beforeAll(() => {
  process.env.WRAP_JWT_SECRET = 'test-secret-please-change-me';
  process.env.AZURE_TABLES_ENDPOINT = 'http://fake-tables';
  process.env.AZURE_TABLES_JOBS = 'wrapJobs';
  process.env.AZURE_TABLES_RESULTS = 'wrapResults';
  process.env.AZURE_SERVICE_BUS_NAMESPACE = 'fake.servicebus.windows.net';
});

beforeEach(() => {
  resetAzureFakes();
  vi.mocked(generateWrap).mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

const SLICE_FIXTURE: SliceContent[] = [
  { sliceKey: 'launches_shipped', headline: 'h', body: 'b' },
];

function makeMessage(overrides: Partial<EnqueueWrapRequest> = {}): EnqueueWrapRequest {
  return {
    jobId: crypto.randomUUID(),
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
    ...overrides,
  };
}

async function seedQueuedJob(installId: string, jobId: string): Promise<void> {
  const now = new Date().toISOString();
  await upsertJobRow({
    installId,
    jobId,
    status: 'queued',
    busy: false,
    createdAt: now,
    updatedAt: now,
  });
}

function envelope(message: EnqueueWrapRequest, installId: string): SentServiceBusMessage {
  return {
    body: message,
    messageId: message.jobId,
    contentType: 'application/json',
    applicationProperties: { jobId: message.jobId, installId },
  };
}

describe('wrapWorker', () => {
  it('flips queued → running → complete and persists the result on the happy path', async () => {
    const installId = 'install-A';
    const message = makeMessage();
    await seedQueuedJob(installId, message.jobId);
    vi.mocked(generateWrap).mockResolvedValue(SLICE_FIXTURE);

    const ctx = makeServiceBusTriggerContext(envelope(message, installId));
    await wrapWorker(message, ctx);

    expect(vi.mocked(generateWrap)).toHaveBeenCalledTimes(1);
    const finalRow = await getJobRow(installId, message.jobId);
    expect(finalRow?.status).toBe('complete');

    const result = await getAndDeleteResult(message.jobId);
    expect(result).toEqual(SLICE_FIXTURE);
  });

  it('returns early without throwing when applicationProperties.installId is missing', async () => {
    const message = makeMessage();
    const logs: LogEntry[] = [];
    const ctx = makeServiceBusTriggerContext(
      { body: message, messageId: message.jobId, applicationProperties: {} },
      (e) => logs.push(e),
    );

    await expect(wrapWorker(message, ctx)).resolves.toBeUndefined();
    expect(vi.mocked(generateWrap)).not.toHaveBeenCalled();
    expect(getTableEntities('wrapJobs')).toEqual([]);
    expect(logs.some((e) => e.level === 'error')).toBe(true);
  });

  it('warns and returns when the job row was already cleaned up', async () => {
    const installId = 'install-A';
    const message = makeMessage();
    // No seed — the row is intentionally absent.

    const logs: LogEntry[] = [];
    const ctx = makeServiceBusTriggerContext(envelope(message, installId), (e) => logs.push(e));
    await wrapWorker(message, ctx);

    expect(vi.mocked(generateWrap)).not.toHaveBeenCalled();
    expect(logs.some((e) => e.level === 'warn')).toBe(true);
  });

  it('marks the job failed with an errorCode when generateWrap throws', async () => {
    const installId = 'install-A';
    const message = makeMessage();
    await seedQueuedJob(installId, message.jobId);
    vi.mocked(generateWrap).mockRejectedValue(Object.assign(new Error('boom'), { name: 'UpstreamError' }));

    const ctx = makeServiceBusTriggerContext(envelope(message, installId));
    await wrapWorker(message, ctx);

    const row = await getJobRow(installId, message.jobId);
    expect(row?.status).toBe('failed');
    expect(row?.errorCode).toBe('UpstreamError');

    // The result row must NOT have been written when generation failed.
    expect(await getAndDeleteResult(message.jobId)).toBeNull();
  });

  it('does not log the message body, contributions, or sliceContent (canary)', async () => {
    const installId = 'install-A';
    const canary = 'CANARY-worker-payload-9c1f';
    const message = makeMessage({
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
    });
    await seedQueuedJob(installId, message.jobId);
    vi.mocked(generateWrap).mockResolvedValue([
      { sliceKey: 'launches_shipped', headline: canary, body: canary },
    ]);

    const logs: LogEntry[] = [];
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    try {
      const ctx = makeServiceBusTriggerContext(envelope(message, installId), (e) => logs.push(e));
      await wrapWorker(message, ctx);
    } finally {
      consoleLog.mockRestore();
      consoleError.mockRestore();
      consoleInfo.mockRestore();
    }

    const dump = JSON.stringify(logs);
    const consoleDump = JSON.stringify([
      ...consoleLog.mock.calls,
      ...consoleError.mock.calls,
      ...consoleInfo.mock.calls,
    ]);
    expect(dump.includes(canary)).toBe(false);
    expect(consoleDump.includes(canary)).toBe(false);
  });

  it('re-runs generateWrap on Service Bus redelivery (documents current behavior — see fix #4)', async () => {
    const installId = 'install-A';
    const message = makeMessage();
    await seedQueuedJob(installId, message.jobId);
    vi.mocked(generateWrap).mockResolvedValue(SLICE_FIXTURE);

    // First delivery
    await wrapWorker(message, makeServiceBusTriggerContext(envelope(message, installId), undefined, { deliveryCount: 1 }));
    // Second delivery (Service Bus redelivered after a transient failure)
    await wrapWorker(message, makeServiceBusTriggerContext(envelope(message, installId), undefined, { deliveryCount: 2 }));

    // Today the worker has no idempotency check — it re-runs generateWrap and
    // overwrites the result. When fix #4 lands, this test should be updated to
    // assert the second delivery is a no-op.
    expect(vi.mocked(generateWrap)).toHaveBeenCalledTimes(2);
    const row = await getJobRow(installId, message.jobId);
    expect(row?.status).toBe('complete');
  });

  it('logs failure and does not throw when marking-failed itself fails', async () => {
    const installId = 'install-A';
    const message = makeMessage();
    await seedQueuedJob(installId, message.jobId);
    vi.mocked(generateWrap).mockRejectedValue(new Error('upstream gone'));

    // Force the second getJobRow inside the catch to throw by stubbing it out.
    // The simplest approach: delete the row mid-flight by mocking generateWrap
    // to also delete it. (Approximates a TTL race.)
    vi.mocked(generateWrap).mockImplementation(async () => {
      // Simulate the row vanishing between the running flip and the failure.
      const { deleteJobRow } = await import('../../src/queue/jobs');
      await deleteJobRow(installId, message.jobId);
      throw new Error('upstream gone');
    });

    const logs: LogEntry[] = [];
    const ctx = makeServiceBusTriggerContext(envelope(message, installId), (e) => logs.push(e));
    await expect(wrapWorker(message, ctx)).resolves.toBeUndefined();

    // The row was deleted mid-flight, so there's nothing to mark failed —
    // the worker should still log and exit cleanly.
    expect(logs.some((e) => e.level === 'error')).toBe(true);
    const row = await getJobRow(installId, message.jobId);
    expect(row).toBeNull();
  });
});
