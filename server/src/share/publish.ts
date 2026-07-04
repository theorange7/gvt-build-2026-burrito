import type { SliceContent, WrapMode } from '@wrapped/shared';
import { generateShareSlug } from './slug';
import { renderShareBundle } from './bundle';
import { blobClient, buildShareUrl } from './blob';
import { createShareLink } from './links';
import type { ShareViewerAssets } from './assets';

/**
 * Publish a single wrap as a shareable bundle. Extracted from `wrapWorker`
 * so the publish contract — slug generation, blob write, table-row write,
 * and the rollback that keeps the two stores from drifting — has a unit
 * test seam independent of the worker, the Service Bus envelope, or job
 * state machine.
 *
 * Atomicity model (two-step write, no real transaction):
 *
 *   1. `blobClient().uploadBundle(...)` writes `index.html` + the two
 *      asset blobs. After step 1 the bundle is *fetchable* by anyone who
 *      knows the slug, but no `shareLinks` row exists yet — so revoke
 *      cannot find it and `meReset` cannot enumerate it.
 *   2. `createShareLink(...)` writes the table row that authorises future
 *      revoke. After step 2 the share is fully durable.
 *
 *   If step 2 throws, step 1 left an orphan blob behind: it is unreachable
 *   via the revoke endpoint (no row) and unreachable via the cascade
 *   delete (no row to enumerate). To prevent garbage from piling up on
 *   retry, we best-effort `deleteBundle(slug)` and re-throw the original
 *   row-write error. If rollback itself fails the upstream error still
 *   wins — the operator's first signal should be the cause, not the
 *   cleanup symptom.
 *
 * This function deliberately does not log. Callers choose their own
 * failure policy:
 *   - the worker treats publish as best-effort (catch + warn + return
 *     undefined; the wrap still completes)
 *   - any future synchronous caller can surface the error to the user
 */
export type PublishShareInput = {
  installId: string;
  jobId: string;
  sliceContent: SliceContent[];
  mode: WrapMode;
  displayName?: string;
  /**
   * Pre-loaded viewer template + asset buffers. Required so this module
   * never touches disk; the worker memoises a single read at startup and
   * threads it in. Unit tests typically pass `loadShareViewerAssets()`
   * directly or a fixture.
   */
  assets: ShareViewerAssets;
};

export type PublishShareResult = {
  shareSlug: string;
  shareUrl: string;
};

export async function publishShareBundle(
  input: PublishShareInput,
): Promise<PublishShareResult> {
  const slug = generateShareSlug();
  const bundle = renderShareBundle(
    {
      sliceContent: input.sliceContent,
      mode: input.mode,
      displayName: input.displayName,
    },
    input.assets,
  );
  const client = blobClient();

  await client.uploadBundle({
    slug,
    indexHtml: bundle.indexHtml,
    viewerJs: bundle.assets['viewer.js'],
    viewerCss: bundle.assets['viewer.css'],
  });

  try {
    await createShareLink({
      slug,
      installId: input.installId,
      jobId: input.jobId,
      createdAt: new Date().toISOString(),
      displayName: input.displayName,
    });
  } catch (err) {
    // Orphan-blob rollback. The row write is what authorises revoke and
    // cascade-delete, so a row-less blob is unreachable garbage. We do
    // the cleanup best-effort and rethrow the *original* error so the
    // caller sees the actual failure cause, not the rollback symptom.
    try {
      await client.deleteBundle(slug);
    } catch {
      /* swallow — original row-write error below is what matters */
    }
    throw err;
  }

  return {
    shareSlug: slug,
    shareUrl: buildShareUrl(slug),
  };
}
