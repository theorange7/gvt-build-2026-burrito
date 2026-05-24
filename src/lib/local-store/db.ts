import Dexie, { type Table } from 'dexie';
import type { EncryptedEnvelope } from './crypto';

/*
 * Local persistence layer (IndexedDB via Dexie).
 *
 * Each row is an encrypted envelope. Sensitive fields (signal, rawData,
 * sliceContent, token sets, identity profile, sync cursor) live in
 * `ciphertext`. Indexed fields (id, occurredAt, category, source, weight,
 * mode, createdAt, providerId, instanceUrl, externalUserId, identityId,
 * externalKey) stay plaintext so queries can use IndexedDB indexes — that
 * is a deliberate trade-off documented in
 * `docs/decisions/contribution-provider-pattern.md`.
 */

export type ContributionRow = {
  id: string;
  occurredAt: string;
  source: string;
  category: string;
  weight: number;
  createdAt: string;
  identityId?: string;
  externalKey?: string;
  iv: Uint8Array;
  ct: Uint8Array;
};

export type WrapRow = {
  id: string;
  mode: string;
  windowStart: string;
  windowEnd: string;
  createdAt: string;
  iv: Uint8Array;
  ct: Uint8Array;
};

export type MetaRow = {
  key: string;
  value: unknown;
};

export type IdentityRow = {
  id: string;
  providerId: string;
  instanceUrl: string;
  externalUserId: string;
  iv: Uint8Array;
  ct: Uint8Array;
};

export type TokenRow = {
  id: string;
  identityId: string;
  iv: Uint8Array;
  ct: Uint8Array;
};

export type SyncStateRow = {
  identityId: string;
  lastSyncAt: number | null;
  lastError: string | null;
  iv: Uint8Array | null;
  ct: Uint8Array | null;
};

export type ImportedRangeRow = {
  id: string;
  identityId: string;
  start: string;
  end: string;
};

export type PendingWrapRow = {
  id: string;
  mode: string;
  windowStart: string;
  windowEnd: string;
  requestedAt: string;
  status: string;
  busy: number;
  modelId?: string;
  lastCheckedAt?: string;
};

// ---------------------------------------------------------------------------
// Session-scoped database naming
// ---------------------------------------------------------------------------

/** localStorage key that stores the active invite-code session slug. */
export const SESSION_STORAGE_KEY = 'burrito:session';

/**
 * Returns the IndexedDB name for the current session.
 * Each invite code gets its own isolated database so users on the same
 * device never share contributions, wraps, or identities.
 */
export function getDbName(): string {
  if (typeof window === 'undefined') return 'wrapped-for-work';
  const session = localStorage.getItem(SESSION_STORAGE_KEY);
  if (!session) return 'wrapped-for-work';
  const slug = session
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return slug ? `wrapped-for-work-${slug}` : 'wrapped-for-work';
}

/**
 * Activate a session for the given invite code.
 * Writes the code to localStorage and resets the DB singleton so the next
 * call to db() opens the correct per-session database.
 */
export function setSessionId(code: string): void {
  localStorage.setItem(SESSION_STORAGE_KEY, code);
  _instance = null;
}

/**
 * Clear the active session (called on "leave preview").
 * Resets the DB singleton so subsequent db() calls use the default database.
 */
export function clearSessionId(): void {
  localStorage.removeItem(SESSION_STORAGE_KEY);
  _instance = null;
}

// ---------------------------------------------------------------------------

export class WrappedDB extends Dexie {
  contributions!: Table<ContributionRow, string>;
  wraps!: Table<WrapRow, string>;
  meta!: Table<MetaRow, string>;
  identities!: Table<IdentityRow, string>;
  tokens!: Table<TokenRow, string>;
  syncState!: Table<SyncStateRow, string>;
  importedRanges!: Table<ImportedRangeRow, string>;
  pendingWrapRequests!: Table<PendingWrapRow, string>;

  constructor() {
    super(getDbName());
    this.version(1).stores({
      contributions: 'id, occurredAt, category, source, weight, createdAt',
      wraps: 'id, mode, createdAt',
      meta: 'key',
    });
    this.version(2).stores({
      contributions:
        'id, occurredAt, category, source, weight, createdAt, identityId, externalKey, [identityId+externalKey]',
      wraps: 'id, mode, createdAt',
      meta: 'key',
      identities: 'id, &[providerId+instanceUrl+externalUserId], providerId, instanceUrl',
      tokens: 'id, &identityId',
      syncState: 'identityId, lastSyncAt',
      importedRanges: 'id, identityId, [identityId+start]',
    });
    this.version(3).stores({
      pendingWrapRequests: 'id, status, requestedAt',
    });
  }
}

let _instance: WrappedDB | null = null;

export function db(): WrappedDB {
  if (!_instance) _instance = new WrappedDB();
  return _instance;
}

export function rowToEnvelope<T extends { iv: Uint8Array; ct: Uint8Array }>(
  row: T,
): EncryptedEnvelope {
  return { iv: row.iv, ct: row.ct };
}

export const META_KEYS = {
  kdfSalt: 'kdfSalt',
  seeded: 'seeded',
  passphraseHint: 'passphraseHint',
  wrapInstallToken: 'wrapInstallToken',
  inviteValidated: 'inviteValidated',
} as const;
