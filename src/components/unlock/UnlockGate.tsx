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

const INK = '#0A0A0A';
const CREAM = '#FFF4DE';
const PAPER = '#FBF5E5';
const HOT = '#FF4D2E';

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
    <main
      style={{ backgroundColor: CREAM }}
      className="flex min-h-screen items-center justify-center px-4"
    >
      <section
        style={{
          backgroundColor: PAPER,
          border: `2px solid ${INK}`,
          boxShadow: `6px 6px 0 ${INK}`,
          borderRadius: '24px',
          padding: '32px',
          maxWidth: '400px',
          width: '100%',
        }}
      >
        {/* Top label */}
        <p
          style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '10px',
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            color: INK,
            opacity: 0.5,
          }}
        >
          Wrapped for Work · Local-first
        </p>

        {/* Title */}
        <h1
          style={{
            fontFamily: 'Space Grotesk, sans-serif',
            fontSize: '28px',
            fontWeight: 700,
            color: INK,
            marginTop: '12px',
            lineHeight: 1.15,
          }}
        >
          {status === 'setup'
            ? 'Create your passphrase.'
            : status === 'unlock'
              ? 'Welcome back.'
              : 'Loading…'}
        </h1>

        {/* Checking state */}
        {status === 'checking' ? (
          <p
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '12px',
              color: INK,
              opacity: 0.55,
              marginTop: '16px',
            }}
          >
            Checking local storage…
          </p>
        ) : null}

        {/* Setup form */}
        {status === 'setup' ? (
          <form
            style={{ marginTop: '24px', display: 'grid', gap: '16px' }}
            onSubmit={(e) => {
              e.preventDefault();
              handleSetup();
            }}
          >
            <p
              style={{
                fontFamily: 'Space Grotesk, sans-serif',
                fontSize: '14px',
                lineHeight: 1.6,
                color: INK,
                opacity: 0.7,
              }}
            >
              Your contributions and wraps stay on this device, encrypted with a
              key derived from this passphrase.{' '}
              <strong style={{ opacity: 1, fontWeight: 700 }}>
                If you forget it, the data is unrecoverable.
              </strong>{' '}
              The server never sees your passphrase or your data at rest.
            </p>

            <input
              type="password"
              autoFocus
              autoComplete="new-password"
              placeholder="Passphrase (min 8 chars)"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              style={{
                background: 'white',
                border: `2px solid ${INK}`,
                borderRadius: '10px',
                padding: '12px 16px',
                fontFamily: 'Space Grotesk, sans-serif',
                fontSize: '15px',
                color: INK,
                outline: 'none',
                width: '100%',
                boxSizing: 'border-box',
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = HOT; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = INK; }}
            />

            <input
              type="password"
              autoComplete="new-password"
              placeholder="Confirm passphrase"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              style={{
                background: 'white',
                border: `2px solid ${INK}`,
                borderRadius: '10px',
                padding: '12px 16px',
                fontFamily: 'Space Grotesk, sans-serif',
                fontSize: '15px',
                color: INK,
                outline: 'none',
                width: '100%',
                boxSizing: 'border-box',
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = HOT; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = INK; }}
            />

            {error ? (
              <p
                style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: '12px',
                  color: HOT,
                  fontWeight: 600,
                }}
              >
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={busy}
              style={{
                background: busy ? '#ccc' : HOT,
                border: `2px solid ${INK}`,
                boxShadow: busy ? 'none' : `3px 3px 0 ${INK}`,
                borderRadius: '10px',
                padding: '13px 20px',
                fontFamily: 'Space Grotesk, sans-serif',
                fontSize: '15px',
                fontWeight: 700,
                color: busy ? INK : CREAM,
                cursor: busy ? 'not-allowed' : 'pointer',
                transition: 'transform 0.1s, box-shadow 0.1s',
                width: '100%',
              }}
              onMouseEnter={(e) => {
                if (!busy) {
                  e.currentTarget.style.transform = 'translate(-1px,-1px)';
                  e.currentTarget.style.boxShadow = `4px 4px 0 ${INK}`;
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translate(0,0)';
                e.currentTarget.style.boxShadow = busy ? 'none' : `3px 3px 0 ${INK}`;
              }}
            >
              {busy ? 'Setting up…' : 'Set passphrase'}
            </button>
          </form>
        ) : null}

        {/* Unlock form */}
        {status === 'unlock' ? (
          <form
            style={{ marginTop: '24px', display: 'grid', gap: '16px' }}
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
              style={{
                background: 'white',
                border: `2px solid ${INK}`,
                borderRadius: '10px',
                padding: '12px 16px',
                fontFamily: 'Space Grotesk, sans-serif',
                fontSize: '15px',
                color: INK,
                outline: 'none',
                width: '100%',
                boxSizing: 'border-box',
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = HOT; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = INK; }}
            />

            {error ? (
              <p
                style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: '12px',
                  color: HOT,
                  fontWeight: 600,
                }}
              >
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={busy}
              style={{
                background: busy ? '#ccc' : HOT,
                border: `2px solid ${INK}`,
                boxShadow: busy ? 'none' : `3px 3px 0 ${INK}`,
                borderRadius: '10px',
                padding: '13px 20px',
                fontFamily: 'Space Grotesk, sans-serif',
                fontSize: '15px',
                fontWeight: 700,
                color: busy ? INK : CREAM,
                cursor: busy ? 'not-allowed' : 'pointer',
                transition: 'transform 0.1s, box-shadow 0.1s',
                width: '100%',
              }}
              onMouseEnter={(e) => {
                if (!busy) {
                  e.currentTarget.style.transform = 'translate(-1px,-1px)';
                  e.currentTarget.style.boxShadow = `4px 4px 0 ${INK}`;
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translate(0,0)';
                e.currentTarget.style.boxShadow = busy ? 'none' : `3px 3px 0 ${INK}`;
              }}
            >
              {busy ? 'Unlocking…' : 'Unlock'}
            </button>
          </form>
        ) : null}
      </section>
    </main>
  );
}
