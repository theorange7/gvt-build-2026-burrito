import Dexie, { type Table } from 'dexie';
import type { EncryptedEnvelope } from './crypto';

/*
 * Local persistence layer (IndexedDB via Dexie).
 *
 * Each row is an encrypted envelope. Sensitive fields (signal, rawData,
 * sliceContent) live in `ciphertext`. Indexed fields (id, occurredAt,
 * category, source, weight, mode, createdAt) stay plaintext so queries
 * can use IndexedDB indexes — that is a deliberate trade-off.
 */

export type ContributionRow = {
  id: string;
  occurredAt: string;
  source: string;
  category: string;
  weight: number;
  createdAt: string;
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

export class WrappedDB extends Dexie {
  contributions!: Table<ContributionRow, string>;
  wraps!: Table<WrapRow, string>;
  meta!: Table<MetaRow, string>;

  constructor() {
    super('wrapped-for-work');
    this.version(1).stores({
      contributions: 'id, occurredAt, category, source, weight, createdAt',
      wraps: 'id, mode, createdAt',
      meta: 'key',
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
} as const;
