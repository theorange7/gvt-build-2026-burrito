/*
 * PRIVACY: Accepts a wrap-generation request and enqueues it for the worker.
 * The contributions payload is forwarded as the Service Bus message body and
 * never persisted in our infra (only the worker reads it once). The job row
 * stores {installId, jobId, status, busy, timestamps} — no contributions, no
 * IPs, no tokens. The Service Bus message metadata carries an opaque per-job
 * `jobLookupToken` instead of installId; the worker resolves the token via a
 * lookup row in the same wrapJobs table so installId never appears in queue
 * metadata, the DLQ, or App Insights trace correlation. Logs only
 * {jobId, code} on errors.
 */
import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import { enqueueWrapRequestSchema } from '@wrapped/shared';
import { requireInstallToken, HttpAuthError } from '../auth/middleware';
import {
  countInflight,
  createJobRow,
  createLookupRow,
  deleteJobRow,
  deleteLookupRow,
  getJobRow,
  isConflictError,
  upsertJobRow,
} from '../queue/jobs';
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
    // Unexpected token-verification failure. Don't `throw` — that auto-captures
    // into App Insights with err.message verbatim. Log the safe code and return
    // a generic 500.
    context.error('wrapEnqueue auth failed', safeError(err));
    return { status: 500, jsonBody: { error: 'auth-error' } };
  }

  let body: ReturnType<typeof enqueueWrapRequestSchema.parse>;
  try {
    body = enqueueWrapRequestSchema.parse(await request.json());
  } catch {
    return { status: 400, jsonBody: { error: 'invalid-payload' } };
  }

  try {
    // Atomically claim the (installId, jobId) row. createJobRow's underlying
    // table insert is conditional, so two concurrent POSTs of the same jobId
    // can't both win — exactly one creates, the other 409s and falls into
    // the idempotent "return existing state" branch below.
    const now = new Date().toISOString();
    let claimed = false;
    try {
      await createJobRow({
        installId,
        jobId: body.jobId,
        status: 'queued',
        busy: false, // provisional — overwritten after the global-cap check
        createdAt: now,
        updatedAt: now,
      });
      claimed = true;
    } catch (err) {
      if (!isConflictError(err)) throw err;
    }

    if (!claimed) {
      const existing = await getJobRow(installId, body.jobId);
      if (existing) {
        return {
          status: 200,
          jsonBody: { jobId: existing.jobId, status: existing.status, busy: existing.busy },
        };
      }
      // Row vanished between the 409 and the read (TTL or admin sweep). Treat
      // as a fresh request and fall through — but at this point the safest
      // response is to ask the client to retry with a new jobId.
      return { status: 503, jsonBody: { error: 'enqueue-conflict' } };
    }

    // Post-claim per-install cap. The claim already occupies one slot, so a
    // count strictly greater than the limit means we raced past the cap;
    // unwind and 429. Concurrent claims at the boundary may both observe
    // count == limit and both succeed (bounded over-cap by N concurrent
    // requests) — strictly enforcing N would need an ETag-managed counter
    // row; intentionally out of scope here.
    const perInstallInflight = await countInflight({ installId });
    if (!decideAccept(perInstallInflight - 1)) {
      await deleteJobRow(installId, body.jobId);
      return { status: 429, jsonBody: { error: 'per-install-limit' } };
    }

    const globalInflight = await countInflight();
    const busy = decideBusy(globalInflight);
    if (busy) {
      // Flip the provisional `busy: false` we wrote during the claim. The
      // worker hasn't seen this row yet (we haven't enqueued), so a Replace
      // here can't race a concurrent status transition.
      await upsertJobRow({
        installId,
        jobId: body.jobId,
        status: 'queued',
        busy: true,
        createdAt: now,
        updatedAt: new Date().toISOString(),
      });
    }

    // Mint an opaque per-job lookup token. The worker uses this — not
    // installId — to find the job row, so installId stays out of Service Bus
    // metadata, the DLQ, and any auto-captured trace correlation.
    const jobLookupToken = crypto.randomUUID();
    try {
      await createLookupRow({ jobLookupToken, installId, jobId: body.jobId });
    } catch (lookupErr) {
      // Almost impossible (UUID collision); unwind the job row and surface 503.
      await deleteJobRow(installId, body.jobId);
      context.error('wrapEnqueue lookup-row create failed', { jobId: body.jobId, ...safeError(lookupErr) });
      return { status: 500, jsonBody: { error: 'enqueue-failed' } };
    }

    try {
      await enqueueWrapJob(body, jobLookupToken);
    } catch (enqueueErr) {
      // Unwind both rows so the caller can retry with a new jobId.
      await deleteLookupRow(jobLookupToken);
      await deleteJobRow(installId, body.jobId);
      throw enqueueErr;
    }

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
