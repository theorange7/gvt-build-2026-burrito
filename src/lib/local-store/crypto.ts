/*
 * AES-GCM-256 + PBKDF2 envelope encryption for the local store.
 *
 * The derived key lives in module-level memory only. It is never written to
 * localStorage or sessionStorage. It is cleared on tab hide + idle and on
 * explicit lock(). An attacker with raw IndexedDB access learns the *shape*
 * of activity (counts per day/category) but not contents — see local-store/db.ts.
 */

const PBKDF2_ITERATIONS = 600_000;
const KEY_LENGTH_BITS = 256;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const IDLE_LOCK_MS = 15 * 60 * 1000;

let cachedKey: CryptoKey | null = null;
let lastTouch = 0;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

export type EncryptedEnvelope = {
  iv: Uint8Array;
  ct: Uint8Array;
};

export function generateSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(SALT_BYTES));
}

export async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: KEY_LENGTH_BITS },
    false,
    ['encrypt', 'decrypt'],
  );
}

export function setActiveKey(key: CryptoKey): void {
  cachedKey = key;
  lastTouch = Date.now();
  scheduleIdleLock();
}

export function hasActiveKey(): boolean {
  return cachedKey !== null;
}

export function lock(): void {
  cachedKey = null;
  lastTouch = 0;
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
}

function scheduleIdleLock() {
  if (typeof window === 'undefined') return;
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (Date.now() - lastTouch >= IDLE_LOCK_MS) lock();
  }, IDLE_LOCK_MS);
}

function requireKey(): CryptoKey {
  if (!cachedKey) {
    throw new Error('Local store is locked. Unlock with passphrase before access.');
  }
  lastTouch = Date.now();
  return cachedKey;
}

export async function encryptJSON(plain: unknown): Promise<EncryptedEnvelope> {
  const key = requireKey();
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const data = new TextEncoder().encode(JSON.stringify(plain));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, data);
  return { iv, ct: new Uint8Array(ct) };
}

export async function decryptJSON<T>(env: EncryptedEnvelope): Promise<T> {
  const key = requireKey();
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: env.iv as BufferSource },
    key,
    env.ct as BufferSource,
  );
  return JSON.parse(new TextDecoder().decode(plain)) as T;
}

if (typeof window !== 'undefined') {
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') scheduleIdleLock();
  });
  window.addEventListener('beforeunload', () => lock());
}
