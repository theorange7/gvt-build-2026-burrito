'use client';

import Link from 'next/link';
import { AddProviderForm } from './AddProviderForm';
import { ProvidersList } from './ProvidersList';

// Side-effect import: registers built-in providers (GitLab Dedicated, …)
// before the AddProviderForm reads from the registry.
import '@/lib/providers';

export function SettingsShell() {
  return (
    <main className="mx-auto min-h-screen max-w-[1080px] px-4 py-6 md:px-8 md:py-8">
      <header className="grid gap-4 rounded-[34px] border border-[color:var(--border)] bg-[color:var(--surface)]/78 p-6 md:p-8">
        <p className="text-xs uppercase tracking-[0.36em] text-[color:var(--muted)]">
          Wrapped for Work · Settings
        </p>
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <h1 className="font-display text-[clamp(2.4rem,5vw,3.6rem)] leading-[0.95] text-[color:var(--foreground)]">
            Contribution providers.
          </h1>
          <Link
            href="/dashboard"
            className="rounded-full border border-white/10 px-4 py-2 text-sm text-[color:var(--foreground)] hover:border-[color:var(--accent)] hover:text-[color:var(--accent)]"
          >
            ← Back to dashboard
          </Link>
        </div>
        <p className="text-sm leading-7 text-[color:var(--muted)]">
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
