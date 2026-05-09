'use client';

import Link from 'next/link';
import { AddProviderForm } from './AddProviderForm';
import { ProvidersList } from './ProvidersList';

// Side-effect import: registers built-in providers (GitLab Dedicated, …)
// before the AddProviderForm reads from the registry.
import '@/lib/providers';

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
