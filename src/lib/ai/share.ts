/**
 * Client wrapper for the share-revocation endpoint (spec 31).
 *
 * Thin HTTP wrapper only — no SDK imports, no credentials, no logging of
 * tokens or slugs. The install JWT is attached via `authHeader()` so the
 * server can prove that the calling install owns the share.
 */
import { authHeader, backendUrl } from './endpoint';

export type RevokeShareResult = 'ok' | 'not-found' | 'forbidden';

export async function revokeShare(slug: string): Promise<RevokeShareResult> {
  const response = await fetch(backendUrl(`/wrap/share/${encodeURIComponent(slug)}`), {
    method: 'DELETE',
    headers: { ...(await authHeader()) },
  });
  if (response.status === 204) return 'ok';
  if (response.status === 404) return 'not-found';
  if (response.status === 403) return 'forbidden';
  const body = await response.json().catch(() => ({}));
  throw new Error(typeof body.error === 'string' ? body.error : `revoke failed (${response.status})`);
}
