/*
 * Unit coverage for `publishShareBundle` — the two-step write contract
 * extracted from `wrapWorker` in spec-31 follow-up cleanup. The point of
 * this suite is to lock down atomicity (blob then row, with rollback) so
 * the worker's "best-effort" framing doesn't quietly leak orphan blobs
 * when the row write fails after the blob write succeeded.
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

import type { TableClient } from '@azure/data-tables';
import type { SliceContent } from '@wrapped/shared';
import {
  fakeShareBlobClient,
  getShareBundle,
  listShareBundles,
  resetAzureFakes,
} from '../fakes/azure';
import { _setBlobClientForTests, type BundleUpload } from '../../src/share/blob';
import { _setShareLinksClientForTests, getShareLink } from '../../src/share/links';
import { publishShareBundle } from '../../src/share/publish';
import { loadShareViewerAssets } from '../../src/share/assets';

beforeAll(() => {
  process.env.AZURE_TABLES_ENDPOINT = 'http://fake-tables';
  process.env.AZURE_TABLES_SHARE_LINKS = 'shareLinks';
  process.env.AZURE_BLOB_STORAGE_ACCOUNT = 'stwrappedtest';
});

beforeEach(() => {
  resetAzureFakes();
  _setBlobClientForTests(fakeShareBlobClient);
  _setShareLinksClientForTests(null);
});

afterEach(() => {
  _setBlobClientForTests(null);
  _setShareLinksClientForTests(null);
});

const SLICE: SliceContent[] = [
  { sliceKey: 'launches_shipped', headline: 'h', body: 'b' },
];

/**
 * Build a TableClient stand-in that throws on `createEntity` — used to
 * simulate a transient row-write failure after the blob write has
 * already succeeded. Only the `createEntity` method is exercised by
 * `createShareLink`, so the rest of the TableClient surface is left
 * untyped and unimplemented.
 */
function failingTableClient(message: string): TableClient {
  return {
    createEntity: async () => {
      const err = new Error(message) as Error & { statusCode: number };
      err.statusCode = 503;
      throw err;
    },
  } as unknown as TableClient;
}

describe('publishShareBundle — happy path', () => {
  it('uploads the bundle, writes the shareLinks row, and returns shareSlug/shareUrl', async () => {
    const assets = loadShareViewerAssets();

    const out = await publishShareBundle({
      installId: 'install-A',
      jobId: 'job-1',
      sliceContent: SLICE,
      mode: 'snapshot',
      displayName: 'Test retro',
      assets,
    });

    expect(out.shareSlug).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(out.shareUrl).toContain(out.shareSlug);
    expect(out.shareUrl).toContain('stwrappedtest.blob.core.windows.net');
    expect(getShareBundle(out.shareSlug)).toBeDefined();

    const link = await getShareLink(out.shareSlug);
    expect(link).not.toBeNull();
    expect(link?.installId).toBe('install-A');
    expect(link?.jobId).toBe('job-1');
    expect(link?.displayName).toBe('Test retro');
  });
});

describe('publishShareBundle — orphan rollback', () => {
  it('deletes the just-uploaded blob when the shareLinks row write fails', async () => {
    // Wrap the default fake so we can observe upload + delete in order.
    const uploaded: string[] = [];
    const deleted: string[] = [];
    _setBlobClientForTests({
      async uploadBundle(u: BundleUpload) {
        uploaded.push(u.slug);
        await fakeShareBlobClient.uploadBundle(u);
      },
      async deleteBundle(slug: string) {
        deleted.push(slug);
        await fakeShareBlobClient.deleteBundle(slug);
      },
    });
    _setShareLinksClientForTests(failingTableClient('table outage'));

    const assets = loadShareViewerAssets();
    await expect(
      publishShareBundle({
        installId: 'install-A',
        jobId: 'job-orphan',
        sliceContent: SLICE,
        mode: 'snapshot',
        assets,
      }),
    ).rejects.toThrow('table outage');

    // Blob was written…
    expect(uploaded).toHaveLength(1);
    // …then immediately rolled back with the same slug.
    expect(deleted).toEqual(uploaded);
    // And the storage fake is empty — no orphan left behind.
    expect(listShareBundles()).toHaveLength(0);
  });

  it('rethrows the original row-write error when the rollback delete itself fails', async () => {
    // Both writes fail: row first, then rollback. The caller should see the
    // *original* row-write error (the root cause), not the cleanup symptom —
    // otherwise operators would chase rollback failures instead of fixing
    // whatever broke the table write.
    _setBlobClientForTests({
      async uploadBundle(u: BundleUpload) {
        await fakeShareBlobClient.uploadBundle(u);
      },
      async deleteBundle() {
        throw new Error('rollback also failed');
      },
    });
    _setShareLinksClientForTests(failingTableClient('row write failed'));

    const assets = loadShareViewerAssets();
    await expect(
      publishShareBundle({
        installId: 'install-A',
        jobId: 'job-double-fail',
        sliceContent: SLICE,
        mode: 'snapshot',
        assets,
      }),
    ).rejects.toThrow('row write failed');
  });

  it('skips the rollback when the blob write itself fails (nothing to clean up)', async () => {
    let deleteCalls = 0;
    _setBlobClientForTests({
      async uploadBundle() {
        throw new Error('blob outage');
      },
      async deleteBundle() {
        deleteCalls += 1;
      },
    });

    const assets = loadShareViewerAssets();
    await expect(
      publishShareBundle({
        installId: 'install-A',
        jobId: 'job-blob-fail',
        sliceContent: SLICE,
        mode: 'snapshot',
        assets,
      }),
    ).rejects.toThrow('blob outage');

    // No row write was attempted, so no rollback should fire — otherwise we'd
    // be issuing a delete against a slug that was never persisted anywhere.
    expect(deleteCalls).toBe(0);
  });
});
