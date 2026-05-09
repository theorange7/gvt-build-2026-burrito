/**
 * Per-install JWT for the Wrapped backing service. Stored in the meta table
 * alongside the kdfSalt. The token is non-sensitive (server-issued, not
 * derived from the passphrase) so it lives in plaintext like the salt — the
 * passphrase-encrypted store doesn't add anything here.
 *
 * The token is reused across sessions so backend-side rate limits and
 * per-install caps are stable for a given device.
 */
import { db, META_KEYS } from './db';

export type InstallToken = {
  token: string;
  expiresAt: number;
};

const TOKEN_TTL_BUFFER_SECONDS = 60;

function getBackendUrl(): string {
  const url = process.env.NEXT_PUBLIC_WRAP_API_URL;
  if (!url) {
    throw new Error('NEXT_PUBLIC_WRAP_API_URL is not set. Add it to .env.local.');
  }
  return url.replace(/\/$/, '');
}

async function readStoredToken(): Promise<InstallToken | null> {
  const row = await db().meta.get(META_KEYS.wrapInstallToken);
  if (!row) return null;
  const value = row.value as InstallToken | undefined;
  if (!value || typeof value.token !== 'string' || typeof value.expiresAt !== 'number') return null;
  return value;
}

async function fetchAndStoreToken(): Promise<InstallToken> {
  const response = await fetch(`${getBackendUrl()}/auth/register`, { method: 'POST' });
  if (!response.ok) {
    throw new Error(`Failed to register install token (${response.status})`);
  }
  const body = (await response.json()) as InstallToken;
  if (typeof body.token !== 'string' || typeof body.expiresAt !== 'number') {
    throw new Error('Malformed register response');
  }
  await db().meta.put({ key: META_KEYS.wrapInstallToken, value: body });
  return body;
}

export async function getOrRegisterInstallToken(): Promise<string> {
  const stored = await readStoredToken();
  const now = Math.floor(Date.now() / 1000);
  if (stored && stored.expiresAt > now + TOKEN_TTL_BUFFER_SECONDS) {
    return stored.token;
  }
  const fresh = await fetchAndStoreToken();
  return fresh.token;
}

export async function _resetInstallTokenForTests(): Promise<void> {
  await db().meta.delete(META_KEYS.wrapInstallToken);
}
