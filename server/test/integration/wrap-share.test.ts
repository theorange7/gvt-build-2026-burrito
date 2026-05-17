/*
 * Integration coverage for spec 31: publish path on the worker, revoke path
 * on the DELETE endpoint, and isolation between installs.
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
vi.mock('../../src/ai/generate', () => ({
  generateWrap: vi.fn(),
}));

import type { HttpRequest, InvocationContext } from '@azure/functions';
import type { EnqueueWrapRequest, SliceContent } from '@wrapped/shared';
import { signInstallToken } from '../../src/auth/jwt';
import { generateWrap } from '../../src/ai/generate';
import { wrapWorker } from '../../src/functions/wrapWorker';
import { wrapShareDeleteHandler } from '../../src/functions/wrapShareDelete';
import { createLookupRow, upsertJobRow } from '../../src/queue/jobs';
import { getAndDeleteResult } from '../../src/queue/results';
import { getShareLink } from '../../src/share/links';
import { _setBlobClientForTests } from '../../src/share/blob';
import {
  fakeShareBlobClient,
  getShareBundle,
  listShareBundles,
  makeServiceBusTriggerContext,
  resetAzureFakes,
  type SentServiceBusMessage,
} from '../fakes/azure';

beforeAll(() => {
  process.env.WRAP_JWT_SECRET = 'test-secret-please-change-me';
  process.env.AZURE_TABLES_ENDPOINT = 'http://fake-tables';
  process.env.AZURE_TABLES_JOBS = 'wrapJobs';
  process.env.AZURE_TABLES_RESULTS = 'wrapResults';
  process.env.AZURE_TABLES_SHARE_LINKS = 'shareLinks';
  process.env.AZURE_SERVICE_BUS_NAMESPACE = 'fake.servicebus.windows.net';
  process.env.AZURE_BLOB_STORAGE_ACCOUNT = 'stwrappedtest';
});

beforeEach(() => {
  resetAzureFakes();
  _setBlobClientForTests(fakeShareBlobClient);
  vi.mocked(generateWrap).mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
  _setBlobClientForTests(null);
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
        rawData: {},
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

async function seedQueuedJob(installId: string, jobId: string): Promise<string> {
  const now = new Date().toISOString();
  await upsertJobRow({
    installId,
    jobId,
    status: 'queued',
    busy: false,
    createdAt: now,
    updatedAt: now,
  });
  const jobLookupToken = crypto.randomUUID();
  await createLookupRow({ jobLookupToken, installId, jobId });
  return jobLookupToken;
}

function envelope(message: EnqueueWrapRequest, jobLookupToken: string): SentServiceBusMessage {
  return {
    body: message,
    messageId: message.jobId,
    contentType: 'application/json',
    applicationProperties: { jobId: message.jobId, jobLookupToken },
  };
}

function makeRequest(init: {
  method: 'DELETE';
  url: string;
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
    json: async () => ({}),
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

describe('wrapWorker — share=true publish path', () => {
  it('uploads index.html + assets, writes a shareLinks row, and surfaces shareUrl/shareSlug', async () => {
    const installId = 'install-A';
    const jobId = crypto.randomUUID();
    const token = await seedQueuedJob(installId, jobId);
    const message = makeMessage({
      jobId,
      share: true,
      shareName: 'Alex — Q2 retro',
    });
    vi.mocked(generateWrap).mockResolvedValue(SLICE_FIXTURE);

    await wrapWorker(message, makeServiceBusTriggerContext(envelope(message, token)));

    const bundles = listShareBundles();
    expect(bundles).toHaveLength(1);
    const slug = bundles[0].slug;
    expect(slug).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(bundles[0].indexHtml).toContain('Alex — Q2 retro');

    const link = await getShareLink(slug);
    expect(link).not.toBeNull();
    expect(link?.installId).toBe(installId);
    expect(link?.jobId).toBe(jobId);
    expect(link?.displayName).toBe('Alex — Q2 retro');

    const result = await getAndDeleteResult(installId, jobId);
    expect(result?.sliceContent).toEqual(SLICE_FIXTURE);
    expect(result?.shareSlug).toBe(slug);
    expect(result?.shareUrl).toContain(slug);
    expect(result?.shareUrl).toContain('stwrappedtest.blob.core.windows.net');
  });

  it('share=false produces zero blob writes and zero shareLinks rows', async () => {
    const installId = 'install-A';
    const jobId = crypto.randomUUID();
    const token = await seedQueuedJob(installId, jobId);
    const message = makeMessage({ jobId, share: false });
    vi.mocked(generateWrap).mockResolvedValue(SLICE_FIXTURE);

    await wrapWorker(message, makeServiceBusTriggerContext(envelope(message, token)));

    expect(listShareBundles()).toHaveLength(0);
    const result = await getAndDeleteResult(installId, jobId);
    expect(result?.shareSlug).toBeUndefined();
    expect(result?.shareUrl).toBeUndefined();
  });

  it('share omitted entirely behaves identically to share=false', async () => {
    const installId = 'install-A';
    const jobId = crypto.randomUUID();
    const token = await seedQueuedJob(installId, jobId);
    const message = makeMessage({ jobId });
    vi.mocked(generateWrap).mockResolvedValue(SLICE_FIXTURE);

    await wrapWorker(message, makeServiceBusTriggerContext(envelope(message, token)));

    expect(listShareBundles()).toHaveLength(0);
  });

  it('honours WRAP_SHARE_BASE_URL when set', async () => {
    process.env.WRAP_SHARE_BASE_URL = 'https://shares.example.test/wraps';
    try {
      const installId = 'install-A';
      const jobId = crypto.randomUUID();
      const token = await seedQueuedJob(installId, jobId);
      const message = makeMessage({ jobId, share: true });
      vi.mocked(generateWrap).mockResolvedValue(SLICE_FIXTURE);

      await wrapWorker(message, makeServiceBusTriggerContext(envelope(message, token)));

      const result = await getAndDeleteResult(installId, jobId);
      expect(result?.shareUrl).toMatch(
        /^https:\/\/shares\.example\.test\/wraps\/[A-Za-z0-9_-]{22}\/index\.html$/,
      );
    } finally {
      delete process.env.WRAP_SHARE_BASE_URL;
    }
  });

  it('the bundle reserves the wraps/{slug}/video.mp4 path for spec 30 without writing one', async () => {
    const installId = 'install-A';
    const jobId = crypto.randomUUID();
    const token = await seedQueuedJob(installId, jobId);
    const message = makeMessage({ jobId, share: true });
    vi.mocked(generateWrap).mockResolvedValue(SLICE_FIXTURE);

    await wrapWorker(message, makeServiceBusTriggerContext(envelope(message, token)));

    const bundles = listShareBundles();
    expect(bundles).toHaveLength(1);
    expect(bundles[0].indexHtml).toContain('video.mp4');
    expect(bundles[0].indexHtml).toMatch(/id="video-link"[^>]*\bhidden\b/);
  });

  it('a share publish failure does not fail the wrap (best-effort)', async () => {
    const installId = 'install-A';
    const jobId = crypto.randomUUID();
    const token = await seedQueuedJob(installId, jobId);
    const message = makeMessage({ jobId, share: true });
    vi.mocked(generateWrap).mockResolvedValue(SLICE_FIXTURE);

    _setBlobClientForTests({
      async uploadBundle() {
        throw new Error('simulated blob outage');
      },
      async deleteBundle() {
        /* noop */
      },
    });

    await wrapWorker(message, makeServiceBusTriggerContext(envelope(message, token)));

    const result = await getAndDeleteResult(installId, jobId);
    expect(result?.sliceContent).toEqual(SLICE_FIXTURE);
    expect(result?.shareSlug).toBeUndefined();
  });
});

describe('DELETE /wrap/share/:slug — revoke', () => {
  async function publishShare(installId: string): Promise<string> {
    const jobId = crypto.randomUUID();
    const token = await seedQueuedJob(installId, jobId);
    const message = makeMessage({ jobId, share: true });
    vi.mocked(generateWrap).mockResolvedValue(SLICE_FIXTURE);
    await wrapWorker(message, makeServiceBusTriggerContext(envelope(message, token)));
    const bundles = listShareBundles();
    return bundles[bundles.length - 1].slug;
  }

  it('with the correct install JWT, deletes blobs + row and returns 204', async () => {
    const { token, installId } = await signInstallToken();
    const slug = await publishShare(installId);
    expect(getShareBundle(slug)).toBeDefined();

    const res = await wrapShareDeleteHandler(
      makeRequest({
        method: 'DELETE',
        url: `http://x/wrap/share/${slug}`,
        token,
        params: { slug },
      }),
      makeContext(),
    );

    expect(res.status).toBe(204);
    expect(getShareBundle(slug)).toBeUndefined();
    expect(await getShareLink(slug)).toBeNull();
  });

  it('with a different install JWT, returns 403 and leaves blobs in place', async () => {
    const a = await signInstallToken();
    const b = await signInstallToken();
    const slug = await publishShare(a.installId);

    const res = await wrapShareDeleteHandler(
      makeRequest({
        method: 'DELETE',
        url: `http://x/wrap/share/${slug}`,
        token: b.token,
        params: { slug },
      }),
      makeContext(),
    );

    expect(res.status).toBe(403);
    expect(getShareBundle(slug)).toBeDefined();
    expect(await getShareLink(slug)).not.toBeNull();
  });

  it('returns 404 for a syntactically valid but unknown slug', async () => {
    const { token } = await signInstallToken();
    const ghostSlug = 'a'.repeat(22);

    const res = await wrapShareDeleteHandler(
      makeRequest({
        method: 'DELETE',
        url: `http://x/wrap/share/${ghostSlug}`,
        token,
        params: { slug: ghostSlug },
      }),
      makeContext(),
    );

    expect(res.status).toBe(404);
  });

  it('returns 400 for a slug that fails the format check', async () => {
    const { token } = await signInstallToken();
    const badSlug = '../etc/passwd';

    const res = await wrapShareDeleteHandler(
      makeRequest({
        method: 'DELETE',
        url: `http://x/wrap/share/${badSlug}`,
        token,
        params: { slug: badSlug },
      }),
      makeContext(),
    );

    expect(res.status).toBe(400);
  });

  it('returns 401 without a bearer token (slug possession alone is not auth)', async () => {
    const { installId } = await signInstallToken();
    const slug = await publishShare(installId);

    const res = await wrapShareDeleteHandler(
      makeRequest({
        method: 'DELETE',
        url: `http://x/wrap/share/${slug}`,
        params: { slug },
      }),
      makeContext(),
    );

    expect(res.status).toBe(401);
    expect(getShareBundle(slug)).toBeDefined();
  });
});
