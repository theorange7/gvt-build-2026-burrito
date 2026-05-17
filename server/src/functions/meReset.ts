/*
 * PRIVACY: Deletes all server-side data for the calling install. The install
 * is identified solely by its JWT — no user-supplied identifiers are read from
 * the request body. Response body carries only resource-type names and a
 * boolean — never installId, slugs, or jobIds. Logs only decision codes and
 * per-resource counts.
 */
import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import { HttpAuthError, requireInstallToken } from '../auth/middleware';
import { checkIpRateLimit } from '../auth/rateLimit';
import { deleteAllJobRowsForInstall, deleteLookupRowsForInstall } from '../queue/jobs';
import { deleteAllResultsForInstall } from '../queue/results';
import { blobClient } from '../share/blob';
import { deleteShareLink, listShareLinksForInstall } from '../share/links';
import { safeError } from '../privacy';

const RESET_RATE_LIMIT_PER_HOUR = 10;

type FailedResource = 'jobs' | 'results' | 'lookups' | 'shares';

function clientIp(request: HttpRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    request.headers.get('x-azure-clientip') ??
    'unknown'
  );
}

export async function meReset(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const ip = clientIp(request);
  const limit = checkIpRateLimit(ip, RESET_RATE_LIMIT_PER_HOUR);
  if (!limit.ok) {
    return { status: 429, jsonBody: { error: 'rate-limited', resetAt: limit.resetAt } };
  }

  let installId: string;
  try {
    ({ installId } = await requireInstallToken(request));
  } catch (err) {
    if (err instanceof HttpAuthError) {
      return { status: err.status, jsonBody: { error: err.message } };
    }
    context.error('meReset auth failed', safeError(err));
    return { status: 500, jsonBody: { error: 'internal-error' } };
  }

  const failed: FailedResource[] = [];
  const counts: Record<string, number> = {};

  try {
    counts.jobs = await deleteAllJobRowsForInstall(installId);
  } catch (err) {
    context.error('meReset jobs cleanup failed', safeError(err));
    failed.push('jobs');
  }

  try {
    counts.results = await deleteAllResultsForInstall(installId);
  } catch (err) {
    context.error('meReset results cleanup failed', safeError(err));
    failed.push('results');
  }

  try {
    counts.lookups = await deleteLookupRowsForInstall(installId);
  } catch (err) {
    context.error('meReset lookups cleanup failed', safeError(err));
    failed.push('lookups');
  }

  try {
    counts.shares = await deleteShareBundlesForInstall(installId);
  } catch (err) {
    const code = (err as { statusCode?: number }).statusCode;
    // 404 = shareLinks table doesn't exist yet on a brand-new deploy. Treat
    // as a no-op rather than a hard failure.
    if (code !== 404) {
      context.error('meReset shares cleanup failed', safeError(err));
      failed.push('shares');
    }
  }

  if (failed.length === 0) {
    context.log('reset.ok', counts);
    return { status: 204 };
  }

  context.log('reset.partial', { failed: failed.length, counts });
  return { status: 207, jsonBody: { failed } };
}

async function deleteShareBundlesForInstall(installId: string): Promise<number> {
  // List + delete each share owned by the install. Best-effort per share:
  // a single failed blob delete should not block the others, but the row
  // tombstone is what stops a future revoke from working, so we keep going
  // on errors and tally only the rows we managed to remove.
  const links = await listShareLinksForInstall(installId);
  let removed = 0;
  const client = blobClient();
  for (const link of links) {
    try {
      await client.deleteBundle(link.slug);
      await deleteShareLink(link.slug);
      removed += 1;
    } catch {
      /* best-effort: keep going */
    }
  }
  return removed;
}

app.http('meReset', {
  route: 'me/data',
  methods: ['DELETE'],
  authLevel: 'anonymous',
  handler: meReset,
});
