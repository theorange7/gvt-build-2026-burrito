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
    super('wrapped-for-work');
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
} as const;
