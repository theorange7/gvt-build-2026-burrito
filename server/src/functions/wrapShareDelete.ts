/*
 * PRIVACY: Revoke a published share. The slug is treated as a *capability*
 * but not as authorization — the install JWT must match the installId stored
 * in the shareLinks row (otherwise a leaked URL becomes a deletion capability).
 *
 * No payload is read from the request body, and the response carries only
 * a status code. The slug never appears in logs (only safe error codes).
 */
import {
  app,
  type HttpRequest,
  type HttpResponseInit,
  type InvocationContext,
} from '@azure/functions';
import { HttpAuthError, requireInstallToken } from '../auth/middleware';
import { blobClient } from '../share/blob';
import { deleteShareLink, getShareLink } from '../share/links';
import { isValidShareSlug } from '../share/slug';
import { safeError } from '../privacy';

export async function wrapShareDeleteHandler(
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
    context.error('wrapShareDelete auth failed', safeError(err));
    return { status: 500, jsonBody: { error: 'auth-error' } };
  }

  const slug = request.params.slug;
  if (!slug || !isValidShareSlug(slug)) {
    return { status: 400, jsonBody: { error: 'invalid-slug' } };
  }

  try {
    const link = await getShareLink(slug);
    if (!link) {
      return { status: 404, jsonBody: { error: 'not-found' } };
    }
    if (link.installId !== installId) {
      // Slug possession alone is not enough — same response shape as a hit
      // could leak existence; 403 here is acceptable because the slug had to
      // be valid to get this far, and the slug itself is 128 bits of entropy.
      return { status: 403, jsonBody: { error: 'forbidden' } };
    }

    await blobClient().deleteBundle(slug);
    await deleteShareLink(slug);

    return { status: 204 };
  } catch (err) {
    context.error('wrapShareDelete failed', safeError(err));
    return { status: 500, jsonBody: { error: 'delete-failed' } };
  }
}

app.http('wrapShareDelete', {
  route: 'wrap/share/{slug}',
  methods: ['DELETE'],
  authLevel: 'anonymous',
  handler: wrapShareDeleteHandler,
});
