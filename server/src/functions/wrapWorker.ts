/*
 * PRIVACY: Service Bus-triggered worker. Reads the message body once, hands
 * it to generateWrap, persists the result, and discards the body. Logs only
 * {jobId, status, durationMs} — never the message body, never sliceContent,
 * never contributions, never any prompt text.
 */
import { app, type InvocationContext } from '@azure/functions';
import type { Contribution, EnqueueWrapRequest } from '@wrapped/shared';
import { generateWrap } from '../ai/generate';
import {
  getJobRowWithEtag,
  isPreconditionFailed,
  resolveInstallIdFromToken,
  updateJobRow,
} from '../queue/jobs';
import { putResult } from '../queue/results';
import { maxDeliveries } from '../queue/concurrency';
import { safeError } from '../privacy';
import { publishShareBundle } from '../share/publish';
import { loadShareViewerAssets, type ShareViewerAssets } from '../share/assets';

/**
 * Memoised viewer-bundle assets. Loaded lazily on the first share publish
 * (rather than at module init) so cold-starts that never publish a share
 * skip the disk reads — and so module load doesn't break in environments
 * that don't ship the dist artifacts (e.g. unit tests that never exercise
 * `share=true`). After the first publish the cache lives for the worker
 * lifetime; tests can rely on the underlying dist being immutable for a
 * test run, so no reset hook is needed.
 */
let cachedShareViewerAssets: ShareViewerAssets | null = null;
function getCachedShareViewerAssets(): ShareViewerAssets {
  if (!cachedShareViewerAssets) cachedShareViewerAssets = loadShareViewerAssets();
  return cachedShareViewerAssets;
}

function hydrateContributions(message: EnqueueWrapRequest): Contribution[] {
  return message.contributions.map((c, idx) => ({
    id: `transient-${idx}`,
    userId: 'transient',
    source: c.source,
    category: c.category,
    signal: c.signal,
    rawData: c.rawData,
    occurredAt: new Date(c.occurredAt),
    weight: c.weight,
    createdAt: new Date(),
  }));
}

export async function wrapWorker(message: unknown, context: InvocationContext): Promise<void> {
  const payload = message as EnqueueWrapRequest;
  const { jobId } = payload;
  const startedAt = Date.now();

  // The Service Bus message carries an opaque jobLookupToken — never the
  // caller's installId. Resolving it goes through a lookup row keyed by token
  // in the same wrapJobs table so the install identifier stays out of queue
  // metadata, the DLQ, and any auto-captured trace correlation.
  const props = context.triggerMetadata?.applicationProperties as Record<string, unknown> | undefined;
  const jobLookupToken = props?.jobLookupToken as string | undefined;

  if (!jobLookupToken) {
    context.error('wrapWorker missing jobLookupToken in applicationProperties', { jobId });
    return;
  }

  const lookup = await resolveInstallIdFromToken(jobLookupToken);
  if (!lookup) {
    // Lookup row was already cleaned up (terminal poll completed) or the
    // token was bogus. Either way nothing useful to do; ack the message.
    context.warn('wrapWorker lookup row missing — job already settled or invalid token', { jobId });
    return;
  }
  const { installId } = lookup;

  const deliveryCount = (context.triggerMetadata?.deliveryCount as number | undefined) ?? 1;

  try {
    const existing = await getJobRowWithEtag(installId, jobId);
    if (!existing) {
      context.warn('wrapWorker job row missing — possibly already cleaned up', { jobId });
      return;
    }

    // Idempotency on Service Bus redelivery: terminal states absorb extra
    // deliveries silently. Without this check, a redelivery after a successful
    // run would re-invoke generateWrap and overwrite the result row.
    if (existing.status === 'complete' || existing.status === 'failed') {
      context.log('wrapWorker idempotent skip', { jobId, status: existing.status, deliveryCount });
      return;
    }

    // Cap retries: if Service Bus has already redelivered too many times, stop
    // running generateWrap and persist a terminal failure. We ack (return
    // normally) instead of throwing so the message doesn't bounce into DLQ —
    // the client polls the persisted status instead.
    if (deliveryCount >= maxDeliveries()) {
      context.warn('wrapWorker max-retries reached; marking failed', { jobId, deliveryCount });
      try {
        await updateJobRow(
          { ...existing, status: 'failed', errorCode: 'max_retries', updatedAt: new Date().toISOString() },
          existing.etag,
        );
      } catch (markErr) {
        if (!isPreconditionFailed(markErr)) throw markErr;
        context.warn('wrapWorker max-retries mark lost the etag race', { jobId });
      }
      return;
    }

    // Optimistic transition queued → running. If another delivery owns this
    // job (412), bail without re-running generateWrap.
    let runningEtag: string;
    try {
      runningEtag = await updateJobRow(
        { ...existing, status: 'running', updatedAt: new Date().toISOString() },
        existing.etag,
      );
    } catch (transitionErr) {
      if (isPreconditionFailed(transitionErr)) {
        context.warn('wrapWorker lost the running-claim race; skipping', { jobId });
        return;
      }
      throw transitionErr;
    }

    const sliceContent = await generateWrap({
      contributions: hydrateContributions(payload),
      mode: payload.mode,
      windowStart: new Date(payload.windowStart),
      windowEnd: new Date(payload.windowEnd),
      modelId: payload.modelId,
    });

    // Publish step (spec 31). Only runs when the caller opted in — share=true.
    // Failure here MUST NOT fail the wrap: the user still gets their result;
    // they just don't get a share link. The publish module owns its own
    // orphan-blob rollback if the row write fails, so the only thing left to
    // do here is log the safe code and continue with shareSlug/shareUrl
    // unset on the result row.
    let share: { shareSlug: string; shareUrl: string } | undefined;
    if (payload.share) {
      try {
        share = await publishShareBundle({
          installId,
          jobId,
          sliceContent,
          mode: payload.mode,
          displayName: payload.shareName,
          assets: getCachedShareViewerAssets(),
        });
      } catch (err) {
        const safe = safeError(err);
        context.warn('wrapWorker share publish failed', { jobId, ...safe });
      }
    }

    await putResult(installId, jobId, sliceContent, share);

    // Conditional flip to complete using the ETag from the running write —
    // not a fresh read. If something else mutated the row during generation
    // (e.g. a concurrent delivery marked it failed), this 412s and we keep
    // their state instead of clobbering it.
    try {
      await updateJobRow(
        { ...existing, status: 'complete', updatedAt: new Date().toISOString() },
        runningEtag,
      );
    } catch (transitionErr) {
      if (isPreconditionFailed(transitionErr)) {
        context.warn('wrapWorker lost the complete-claim race', { jobId });
        return;
      }
      throw transitionErr;
    }

    context.log('wrapWorker complete', { jobId, durationMs: Date.now() - startedAt });
  } catch (err) {
    const safe = safeError(err);
    context.error('wrapWorker failed', { jobId, ...safe });
    try {
      const existing = await getJobRowWithEtag(installId, jobId);
      if (existing) {
        try {
          await updateJobRow(
            { ...existing, status: 'failed', errorCode: safe.code, updatedAt: new Date().toISOString() },
            existing.etag,
          );
        } catch (markErr) {
          if (!isPreconditionFailed(markErr)) throw markErr;
          // Another writer (likely a parallel redelivery) won. Don't clobber.
          context.warn('wrapWorker failed to mark failed — row was modified concurrently', { jobId });
        }
      }
    } catch (markErr) {
      context.error('wrapWorker failed to mark job failed', { jobId, ...safeError(markErr) });
    }
  }
}

app.serviceBusQueue('wrapWorker', {
  connection: 'ServiceBusConnection',
  queueName: process.env.AZURE_SERVICE_BUS_QUEUE_NAME ?? 'wrap-jobs',
  handler: wrapWorker,
});
