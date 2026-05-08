/*
 * PRIVACY: Accepts a wrap-generation request and enqueues it for the worker.
 * The contributions payload is forwarded as the Service Bus message body and
 * never persisted in our infra (only the worker reads it once). The job row
 * stores {installId, jobId, status, busy, timestamps} — no contributions, no
 * IPs, no tokens. Logs only {jobId, status} on errors.
 */
import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import { enqueueWrapRequestSchema } from '@wrapped/shared';
import { requireInstallToken, HttpAuthError } from '../auth/middleware';
import { countInflight, getJobRow, upsertJobRow } from '../queue/jobs';
import { enqueueWrapJob } from '../queue/serviceBus';
import { decideAccept, decideBusy } from '../queue/concurrency';
import { safeError } from '../privacy';

export async function wrapEnqueueHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  let installId: string;
  try {
    ({ installId } = await requireInstallToken(request));
  } catch (err) {
    if (err instanceof HttpAuthError) {
      return { status: err.status, jsonBody: { error: err.message } };
    }
    throw err;
  }

  let body: ReturnType<typeof enqueueWrapRequestSchema.parse>;
  try {
    body = enqueueWrapRequestSchema.parse(await request.json());
  } catch (err) {
    return { status: 400, jsonBody: { error: 'invalid-payload', details: safeError(err).message } };
  }

  try {
    const existing = await getJobRow(installId, body.jobId);
    if (existing) {
      return {
        status: 200,
        jsonBody: { jobId: existing.jobId, status: existing.status, busy: existing.busy },
      };
    }

    const perInstallInflight = await countInflight({ installId });
    if (!decideAccept(perInstallInflight)) {
      return { status: 429, jsonBody: { error: 'per-install-limit' } };
    }

    const globalInflight = await countInflight();
    const busy = decideBusy(globalInflight);

    const now = new Date().toISOString();
    await upsertJobRow({
      installId,
      jobId: body.jobId,
      status: 'queued',
      busy,
      createdAt: now,
      updatedAt: now,
    });

    await enqueueWrapJob(body, installId);

    return { status: 200, jsonBody: { jobId: body.jobId, status: 'queued', busy } };
  } catch (err) {
    context.error('wrapEnqueue failed', { jobId: body.jobId, ...safeError(err) });
    return { status: 500, jsonBody: { error: 'enqueue-failed' } };
  }
}

app.http('wrapEnqueue', {
  route: 'wrap',
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: wrapEnqueueHandler,
});
