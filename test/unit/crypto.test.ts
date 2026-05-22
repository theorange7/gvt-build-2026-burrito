import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  decryptJSON,
  deriveKey,
  encryptJSON,
  generateSalt,
  hasActiveKey,
  IDLE_LOCK_MS,
  lock,
  LOCK_HOLD_MAX_MS,
  pauseIdleLock,
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

  it('pauseIdleLock does not block an explicit user-initiated lock', async () => {
    const key = await deriveKey('p', generateSalt());
    setActiveKey(key);
    const release = pauseIdleLock();
    try {
      expect(hasActiveKey()).toBe(true);
      lock();
      expect(hasActiveKey()).toBe(false);
      await expect(encryptJSON({ x: 1 })).rejects.toThrow(/locked/i);
    } finally {
      release();
    }
  });

  it('pauseIdleLock returns a release fn that is safe to call twice', async () => {
    const key = await deriveKey('p', generateSalt());
    setActiveKey(key);
    const release = pauseIdleLock();
    release();
    expect(() => release()).not.toThrow();
    lock();
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

/**
 * Fake-timer tests for the idle-lock scheduler and pauseIdleLock hold
 * mechanism. These drive vitest's fake clock forward without waiting for
 * real wall-clock time, so we can exercise 15-minute and 3-minute
 * timers instantly. Each test starts with a freshly armed key; afterEach
 * calls lock() to clear the key and any pending idle timer.
 *
 * Key behaviors verified:
 *   1. Idle lock fires after exactly IDLE_LOCK_MS with no active hold.
 *   2. Releasing a hold re-arms the idle timer from the release moment
 *      (not from the original setActiveKey time), so the key stays alive
 *      through an import that completes before the ceiling.
 *   3. A hold that is never released (hung upload) auto-expires after
 *      LOCK_HOLD_MAX_MS and the idle lock still fires at IDLE_LOCK_MS.
 */
describe('pauseIdleLock — timer behavior', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    lock();
    vi.useRealTimers();
  });

  it('idle lock fires after IDLE_LOCK_MS of inactivity', async () => {
    const key = await deriveKey('p', generateSalt());
    setActiveKey(key);
    vi.advanceTimersByTime(IDLE_LOCK_MS);
    expect(hasActiveKey()).toBe(false);
  });

  it('idle timer re-arms from the release time, not from the original setActiveKey call', async () => {
    const key = await deriveKey('p', generateSalt());
    setActiveKey(key); // schedules T_idle at now + IDLE_LOCK_MS

    const release = pauseIdleLock();
    // Release well before the hold's own ceiling so release() is not a no-op.
    vi.advanceTimersByTime(LOCK_HOLD_MAX_MS - 1);
    release(); // cancels the hold ceiling, deletes the hold, re-arms T_idle from now

    // The original T_idle (at IDLE_LOCK_MS from setActiveKey) was replaced.
    // Advancing to that old deadline should NOT lock the key.
    vi.advanceTimersByTime(IDLE_LOCK_MS - LOCK_HOLD_MAX_MS);
    expect(hasActiveKey()).toBe(true);

    // Advance the rest of the new IDLE_LOCK_MS window — this triggers the lock.
    vi.advanceTimersByTime(LOCK_HOLD_MAX_MS);
    expect(hasActiveKey()).toBe(false);
  });

  it('auto-expiring hold (LOCK_HOLD_MAX_MS ceiling) does not prevent the idle lock from firing', async () => {
    const key = await deriveKey('p', generateSalt());
    setActiveKey(key);
    pauseIdleLock(); // intentionally never released — simulates a hung upload

    // The ceiling fires at LOCK_HOLD_MAX_MS and removes the stale hold.
    // The idle timer fires at IDLE_LOCK_MS (> LOCK_HOLD_MAX_MS) and locks.
    vi.advanceTimersByTime(IDLE_LOCK_MS);
    expect(hasActiveKey()).toBe(false);
  });
});
