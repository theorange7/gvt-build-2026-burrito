'use client';

/*
 * UnlockGate gates every protected route behind a passphrase. On first launch
 * it sets one (and persists a 16-byte salt). On return it derives the same key
 * and loads it into the in-memory cache used by local-store/crypto.ts.
 *
 * The passphrase is never stored. If the user forgets it, the data is
 * unrecoverable — that is the point of E2E encryption.
 */
import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  deriveKey,
  generateSalt,
  hasActiveKey,
  lock,
  setActiveKey,
} from '@/lib/local-store/crypto';
import { db, META_KEYS } from '@/lib/local-store/db';
import { isBrowser } from '@/lib/local-store/platform';

type GateStatus = 'checking' | 'setup' | 'unlock' | 'unlocked';

export function UnlockGate({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<GateStatus>('checking');
  const [passphrase, setPassphrase] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isBrowser()) return;
    if (hasActiveKey()) {
      setStatus('unlocked');
      return;
    }
    db()
      .meta.get(META_KEYS.kdfSalt)
      .then((row) => {
        setStatus(row ? 'unlock' : 'setup');
      });
  }, []);

  const handleSetup = useCallback(async () => {
    setError(null);
    if (passphrase.length < 8) {
      setError('Passphrase must be at least 8 characters.');
      return;
    }
    if (passphrase !== confirm) {
      setError('Passphrases do not match.');
      return;
    }
    setBusy(true);
    try {
      const salt = generateSalt();
      const key = await deriveKey(passphrase, salt);
      await db().meta.put({ key: META_KEYS.kdfSalt, value: Array.from(salt) });
      setActiveKey(key);
      if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
        navigator.storage.persist().catch(() => undefined);
      }
      setPassphrase('');
      setConfirm('');
      setStatus('unlocked');
      queryClient.invalidateQueries({ queryKey: ['contributions'] });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to set up encryption.');
    } finally {
      setBusy(false);
    }
  }, [passphrase, confirm, queryClient]);

  const handleUnlock = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const row = await db().meta.get(META_KEYS.kdfSalt);
      if (!row) throw new Error('No salt found. Try setting up again.');
      const salt = Uint8Array.from(row.value as number[]);
      const key = await deriveKey(passphrase, salt);
      // Validate by attempting to decrypt the first contribution if any exist;
      // otherwise accept the key.
      const sample = await db().contributions.limit(1).first();
      if (sample) {
        const { decryptJSON } = await import('@/lib/local-store/crypto');
        setActiveKey(key);
        try {
          await decryptJSON({ iv: sample.iv, ct: sample.ct });
        } catch {
          lock();
          throw new Error('Wrong passphrase.');
        }
      } else {
        setActiveKey(key);
      }
      setPassphrase('');
      setStatus('unlocked');
      queryClient.invalidateQueries({ queryKey: ['contributions'] });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to unlock.');
    } finally {
      setBusy(false);
    }
  }, [passphrase, queryClient]);

  if (status === 'unlocked') {
    return <>{children}</>;
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#08080d] px-4 text-white">
      <section className="w-full max-w-md rounded-[28px] border border-white/10 bg-[#111118] px-8 py-10 shadow-[0_30px_120px_rgba(0,0,0,0.55)]">
        <p className="text-xs uppercase tracking-[0.34em] text-white/45">Wrapped for Work · Local-first</p>
        <h1 className="mt-3 font-display text-3xl">
          {status === 'setup' ? 'Set a passphrase to encrypt your data.' : status === 'unlock' ? 'Unlock your local data.' : 'Loading…'}
        </h1>

        {status === 'checking' ? (
          <p className="mt-4 text-sm text-white/55">Checking local storage…</p>
        ) : null}

        {status === 'setup' ? (
          <form
            className="mt-6 grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              handleSetup();
            }}
          >
            <p className="text-sm leading-6 text-white/55">
              Your contributions and wraps stay on this device, encrypted with a key derived from this passphrase.
              <strong className="text-white/80"> If you forget it, the data is unrecoverable.</strong> The server never sees your passphrase or your data at rest.
            </p>
            <input
              type="password"
              autoFocus
              autoComplete="new-password"
              placeholder="Passphrase (min 8 chars)"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              className="rounded-[18px] border border-white/10 bg-black/30 px-4 py-3 text-white outline-none focus:border-[color:var(--accent)]"
            />
            <input
              type="password"
              autoComplete="new-password"
              placeholder="Confirm passphrase"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="rounded-[18px] border border-white/10 bg-black/30 px-4 py-3 text-white outline-none focus:border-[color:var(--accent)]"
            />
            {error ? <p className="text-sm text-[rgb(255,193,168)]">{error}</p> : null}
            <button
              type="submit"
              disabled={busy}
              className="rounded-full bg-[color:var(--accent)] px-5 py-3 text-sm font-medium text-black disabled:opacity-60"
            >
              {busy ? 'Setting up…' : 'Set passphrase'}
            </button>
          </form>
        ) : null}

        {status === 'unlock' ? (
          <form
            className="mt-6 grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              handleUnlock();
            }}
          >
            <input
              type="password"
              autoFocus
              autoComplete="current-password"
              placeholder="Passphrase"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              className="rounded-[18px] border border-white/10 bg-black/30 px-4 py-3 text-white outline-none focus:border-[color:var(--accent)]"
            />
            {error ? <p className="text-sm text-[rgb(255,193,168)]">{error}</p> : null}
            <button
              type="submit"
              disabled={busy}
              className="rounded-full bg-[color:var(--accent)] px-5 py-3 text-sm font-medium text-black disabled:opacity-60"
            >
              {busy ? 'Unlocking…' : 'Unlock'}
            </button>
          </form>
        ) : null}
      </section>
    </main>
  );
}
