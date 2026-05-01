import { describe, expect, it } from 'vitest';
import {
  decryptJSON,
  deriveKey,
  encryptJSON,
  generateSalt,
  hasActiveKey,
  lock,
  setActiveKey,
} from '@/lib/local-store/crypto';

describe('crypto', () => {
  it('round-trips an arbitrary payload', async () => {
    const salt = generateSalt();
    const key = await deriveKey('correct horse battery staple', salt);
    setActiveKey(key);

    const payload = { signal: 'shipped X', rawData: { pr: 1234 }, nested: [1, 2, 3] };
    const env = await encryptJSON(payload);
    const decoded = await decryptJSON<typeof payload>(env);
    expect(decoded).toEqual(payload);
  });

  it('produces different ciphertext for the same plaintext (random IV)', async () => {
    const salt = generateSalt();
    const key = await deriveKey('passphrase', salt);
    setActiveKey(key);
    const a = await encryptJSON({ x: 1 });
    const b = await encryptJSON({ x: 1 });
    expect(a.iv).not.toEqual(b.iv);
    expect(a.ct).not.toEqual(b.ct);
  });

  it('derives the same key from the same passphrase + salt across runs', async () => {
    const salt = generateSalt();
    const key1 = await deriveKey('same-pass', salt);
    setActiveKey(key1);
    const env = await encryptJSON({ note: 'persisted' });

    lock();
    const key2 = await deriveKey('same-pass', salt);
    setActiveKey(key2);
    const decoded = await decryptJSON<{ note: string }>(env);
    expect(decoded.note).toBe('persisted');
  });

  it('fails to decrypt with the wrong passphrase', async () => {
    const salt = generateSalt();
    const right = await deriveKey('right', salt);
    setActiveKey(right);
    const env = await encryptJSON({ secret: 'hello' });

    lock();
    const wrong = await deriveKey('wrong', salt);
    setActiveKey(wrong);
    await expect(decryptJSON(env)).rejects.toThrow();
  });

  it('throws when no key is active', async () => {
    lock();
    await expect(encryptJSON({ x: 1 })).rejects.toThrow(/locked/i);
  });

  it('reflects active state via hasActiveKey/lock', async () => {
    expect(hasActiveKey()).toBe(false);
    const key = await deriveKey('p', generateSalt());
    setActiveKey(key);
    expect(hasActiveKey()).toBe(true);
    lock();
    expect(hasActiveKey()).toBe(false);
  });
});
