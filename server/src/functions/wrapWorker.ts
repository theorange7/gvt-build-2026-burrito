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
  updateJobRow,
} from '../queue/jobs';
import { putResult } from '../queue/results';
import { maxDeliveries } from '../queue/concurrency';
import { safeError } from '../privacy';

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

  // Locate the job row to find the partition key (installId). Partial scan via
  // the message itself would be ideal, but the message intentionally omits
  // installId — we look it up by jobId.
  // Simpler: store installId alongside the message via applicationProperties.
  // For now, rely on context.triggerMetadata or fall back to a marker scan.
  const installId = (context.triggerMetadata?.applicationProperties as Record<string, unknown> | undefined)?.installId as
    | string
    | undefined;

  if (!installId) {
    context.error('wrapWorker missing installId in applicationProperties', { jobId });
    return;
  }

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
          { ...existing, status: 'failed', errorCode: 'max-retries', updatedAt: new Date().toISOString() },
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

    await putResult(jobId, sliceContent);

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
