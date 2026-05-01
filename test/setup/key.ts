import { deriveKey, generateSalt, setActiveKey } from '@/lib/local-store/crypto';

let cached: { passphrase: string; salt: Uint8Array; key: CryptoKey } | null = null;

export const TEST_PASSPHRASE = 'correct horse battery staple';

export async function loadTestKey(): Promise<{ salt: Uint8Array; key: CryptoKey }> {
  if (!cached) {
    const salt = generateSalt();
    const key = await deriveKey(TEST_PASSPHRASE, salt);
    cached = { passphrase: TEST_PASSPHRASE, salt, key };
  }
  setActiveKey(cached.key);
  return { salt: cached.salt, key: cached.key };
}
