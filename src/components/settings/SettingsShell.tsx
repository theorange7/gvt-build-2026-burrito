'use client';

import Link from 'next/link';
import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AddProviderForm } from './AddProviderForm';
import { ProvidersList } from './ProvidersList';
import { clearSessionId, db, META_KEYS } from '@/lib/local-store/db';

// Side-effect import: registers built-in providers (GitLab Dedicated, …)
// before the AddProviderForm reads from the registry.
import '@/lib/providers';

function LeavePreviewButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const handleLeave = useCallback(async () => {
    setBusy(true);
    await db().meta.delete(META_KEYS.inviteValidated);
    await db().meta.delete(META_KEYS.wrapInstallToken);
    clearSessionId();
    router.refresh();
    window.location.reload();
  }, [router]);

  return (
    <button
      onClick={handleLeave}
      disabled={busy}
      style={{
        fontFamily: "'Space Grotesk', sans-serif",
        background: 'transparent',
        border: '2px solid #0A0A0A',
        boxShadow: '3px 3px 0 #0A0A0A',
        borderRadius: '8px',
        padding: '8px 18px',
        color: '#0A0A0A',
        fontWeight: 600,
        fontSize: '0.875rem',
        cursor: busy ? 'not-allowed' : 'pointer',
        opacity: busy ? 0.5 : 1,
      }}
      onMouseEnter={(e) => { if (!busy) e.currentTarget.style.transform = 'translate(-1px,-1px)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = 'translate(0,0)'; }}
    >
      {busy ? 'Leaving…' : 'Leave preview'}
    </button>
  );
}

export function SettingsShell() {
  return (
    <main
      className="mx-auto min-h-screen max-w-[1080px] px-4 py-6 md:px-8 md:py-8"
      style={{ background: '#FFF4DE' }}
    >
      <header
        className="grid gap-4 rounded-[20px] p-6 md:p-8"
        style={{
          background: '#FBF5E5',
          border: '2px solid #0A0A0A',
          boxShadow: '4px 4px 0 #0A0A0A',
        }}
      >
        <p
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '10px',
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            color: '#0A0A0A',
            opacity: 0.6,
          }}
        >
          Wrapped for Work · Settings
        </p>
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <h1
            className="leading-[0.95]"
            style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: 'clamp(2.4rem, 5vw, 3.6rem)',
              fontWeight: 800,
              color: '#0A0A0A',
            }}
          >
            Contribution providers.
          </h1>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <LeavePreviewButton />
            <Link
              href="/dashboard"
              className="text-sm transition hover:translate-y-[-1px]"
              style={{
                fontFamily: "'Space Grotesk', sans-serif",
                background: '#FBF5E5',
                border: '2px solid #0A0A0A',
                boxShadow: '3px 3px 0 #0A0A0A',
                borderRadius: '8px',
                padding: '8px 18px',
                color: '#0A0A0A',
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              ← Back to dashboard
            </Link>
          </div>
        </div>
        <p
          className="text-sm leading-7"
          style={{
            fontFamily: "'Space Grotesk', sans-serif",
            color: '#0A0A0A',
            opacity: 0.65,
          }}
        >
          Connect a contribution source, trigger a manual sync, or backfill a
          historical date range. All credentials and contribution data stay
          encrypted on this device — the server never sees them.
        </p>
      </header>

      <section className="mt-6 grid gap-6 lg:grid-cols-2">
        <ProvidersList />
        <AddProviderForm />
      </section>
    </main>
  );
}
