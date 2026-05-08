/**
 * Resolves the backing-service URL and bearer-token header used by every AI
 * call from the client. The backend is a separately deployed Azure Functions
 * app at `NEXT_PUBLIC_WRAP_API_URL` (e.g. http://localhost:7071/api during
 * dev). The token is a per-install JWT minted by `auth/register` and stored
 * in the local-store meta table.
 *
 * This file is also the future seam for a "bring-your-own-model" client-only
 * flow: a future `LLM_MODE === 'local'` branch would short-circuit the fetch
 * and call an in-process provider instead. Out of scope for the current
 * change.
 */
import { getOrRegisterInstallToken } from '@/lib/local-store/auth';

export function getBackendUrl(): string {
  const url = process.env.NEXT_PUBLIC_WRAP_API_URL;
  if (!url) {
    throw new Error('NEXT_PUBLIC_WRAP_API_URL is not set. Add it to .env.local.');
  }
  return url.replace(/\/$/, '');
}

export function backendUrl(path: string): string {
  return `${getBackendUrl()}${path.startsWith('/') ? path : `/${path}`}`;
}

export async function authHeader(): Promise<Record<string, string>> {
  const token = await getOrRegisterInstallToken();
  return { authorization: `Bearer ${token}` };
}
