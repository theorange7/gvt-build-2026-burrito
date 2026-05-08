/*
 * PRIVACY: Service Bus-triggered worker. Reads the message body once, hands
 * it to generateWrap, persists the result, and discards the body. Logs only
 * {jobId, status, durationMs} — never the message body, never sliceContent,
 * never contributions, never any prompt text.
 */
import { app, type InvocationContext } from '@azure/functions';
import type { Contribution, EnqueueWrapRequest } from '@wrapped/shared';
import { generateWrap } from '../ai/generate';
import { upsertJobRow, getJobRow } from '../queue/jobs';
import { putResult } from '../queue/results';
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

  try {
    const existing = await getJobRow(installId, jobId);
    if (!existing) {
      context.warn('wrapWorker job row missing — possibly already cleaned up', { jobId });
      return;
    }

    await upsertJobRow({
      ...existing,
      status: 'running',
      updatedAt: new Date().toISOString(),
    });

    const sliceContent = await generateWrap({
      contributions: hydrateContributions(payload),
      mode: payload.mode,
      windowStart: new Date(payload.windowStart),
      windowEnd: new Date(payload.windowEnd),
      modelId: payload.modelId,
    });

    await putResult(jobId, sliceContent);
    await upsertJobRow({
      ...existing,
      status: 'complete',
      updatedAt: new Date().toISOString(),
    });

    context.log('wrapWorker complete', { jobId, durationMs: Date.now() - startedAt });
  } catch (err) {
    const safe = safeError(err);
    context.error('wrapWorker failed', { jobId, ...safe });
    try {
      const existing = await getJobRow(installId, jobId);
      if (existing) {
        await upsertJobRow({
          ...existing,
          status: 'failed',
          errorCode: safe.code,
          updatedAt: new Date().toISOString(),
        });
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
