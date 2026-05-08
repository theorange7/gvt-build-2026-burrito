/*
 * PRIVACY: Returns job status and, on completion, the sliceContent — once.
 * The result row and the job row are deleted on first successful read. Logs
 * only {jobId, status} on errors; never logs sliceContent.
 */
import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import { requireInstallToken, HttpAuthError } from '../auth/middleware';
import { deleteJobRow, getJobRow } from '../queue/jobs';
import { getAndDeleteResult } from '../queue/results';
import { safeError } from '../privacy';

export async function wrapGetHandler(
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

  const jobId = request.params.jobId;
  if (!jobId) {
    return { status: 400, jsonBody: { error: 'missing-job-id' } };
  }

  try {
    const row = await getJobRow(installId, jobId);
    if (!row) {
      return { status: 404, jsonBody: { error: 'not-found' } };
    }

    if (row.status === 'complete') {
      const sliceContent = await getAndDeleteResult(jobId);
      await deleteJobRow(installId, jobId);
      if (!sliceContent) {
        return { status: 410, jsonBody: { error: 'result-already-fetched' } };
      }
      return { status: 200, jsonBody: { status: 'complete', sliceContent } };
    }

    if (row.status === 'failed') {
      await deleteJobRow(installId, jobId);
      return { status: 200, jsonBody: { status: 'failed', error: row.errorCode ?? 'unknown' } };
    }

    return { status: 200, jsonBody: { status: row.status, busy: row.busy || undefined } };
  } catch (err) {
    context.error('wrapGet failed', { jobId, ...safeError(err) });
    return { status: 500, jsonBody: { error: 'wrap-get-failed' } };
  }
}

app.http('wrapGet', {
  route: 'wrap/{jobId}',
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: wrapGetHandler,
});
