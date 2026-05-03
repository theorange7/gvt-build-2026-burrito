'use client';

/*
 * Design philosophy: Editorial brutalism softened by institutional modernism.
 * File role: Compose the dashboard shell so live data, authored framing, and manual input share one deliberate rhythm.
 * Guardrail: Preserve the publication-like structure while enabling immediate interaction feedback.
 */
import { useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ContributionFeed } from '@/components/dashboard/ContributionFeed';
import { GenerateWrapModal } from '@/components/dashboard/GenerateWrapModal';
import { ManualInputForm } from '@/components/dashboard/ManualInputForm';
import { useContributions } from '@/components/dashboard/useContributions';
import { isSeeded, markSeeded, seedFromBundledDemo } from '@/lib/local-store/seed';

const DEFAULT_MX_PALETTE = {
  id: 'tomato', label: 'Tomato', sub: 'default', swatch: ['#FF4D2E', '#C6FF3B', '#0A0A0A', '#6B3DFF', '#7BE3FF'],
  hot: '#FF4D2E', lime: '#C6FF3B', ink: '#0A0A0A', cream: '#FFF4DE', paper: '#FBF5E5',
  accent: '#6B3DFF', accent2: '#7BE3FF', accent3: '#FFB3C7',
};

export function DashboardShell() {
  const { data: contributions } = useContributions();
  const [seedChecked, setSeedChecked] = useState(false);
  const [showFirstRun, setShowFirstRun] = useState(false);

  useEffect(() => {
    let cancelled = false;
    isSeeded().then((seeded) => {
      if (cancelled) return;
      if (!seeded && (!contributions || contributions.length === 0)) {
        setShowFirstRun(true);
      }
      setSeedChecked(true);
    });
    return () => {
      cancelled = true;
    };
  }, [contributions]);

  const seedMutation = useMutation({
    mutationFn: async () => seedFromBundledDemo(),
    onSuccess: () => setShowFirstRun(false),
  });

  const startFresh = useMutation({
    mutationFn: async () => markSeeded(),
    onSuccess: () => setShowFirstRun(false),
  });

  return (
    <main className="mx-auto min-h-screen max-w-[1480px] px-4 py-6 md:px-8 md:py-8">
      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.45fr)_360px]">
        <div className="space-y-6">
          <header className="grid gap-6 rounded-[34px] border border-[color:var(--border)] bg-[color:var(--surface)]/78 p-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start lg:p-8">
            <div>
              <p className="text-xs uppercase tracking-[0.36em] text-[color:var(--muted)]">Wrapped for Work · Local-first</p>
              <h1 className="mt-3 max-w-4xl font-display text-[clamp(3.1rem,7vw,5.7rem)] leading-[0.9] text-[color:var(--foreground)]">
                A year of contribution, staged like a record worth keeping.
              </h1>
            </div>
            <div className="flex flex-wrap items-start justify-end gap-3 lg:pt-1">
              <Link
                href="/dashboard/settings"
                className="rounded-full border border-white/10 px-4 py-2 text-sm text-[color:var(--foreground)] hover:border-[color:var(--accent)] hover:text-[color:var(--accent)]"
              >
                Provider settings
              </Link>
              <GenerateWrapModal />
            </div>
            <div className="grid gap-4 border-t border-white/6 pt-6 md:grid-cols-3 lg:col-span-2">
              <div>
                <p className="text-xs uppercase tracking-[0.32em] text-[color:var(--muted)]">Mode contrast</p>
                <p className="mt-2 text-sm leading-6 text-[color:var(--foreground)]">Snapshot reads like a dense pulse check; Year-End reads like a polished performance narrative.</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.32em] text-[color:var(--muted)]">On-device storage</p>
                <p className="mt-2 text-sm leading-6 text-[color:var(--foreground)]">Contributions and wraps live encrypted in your browser. The backend never persists your data.</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.32em] text-[color:var(--muted)]">Privacy model</p>
                <p className="mt-2 text-sm leading-6 text-[color:var(--foreground)]">Encrypted at rest with your <span className="text-[color:var(--accent)]">passphrase</span>. AI calls are stripped of identifiers before they leave the device.</p>
              </div>
            </div>
          </header>

          {showFirstRun && seedChecked ? (
            <section className="rounded-[28px] border border-white/10 bg-[color:var(--surface)]/78 p-6 md:p-8">
              <p className="text-xs uppercase tracking-[0.34em] text-[color:var(--muted)]">First launch</p>
              <h2 className="mt-3 font-display text-3xl text-[color:var(--foreground)]">Start with a clean year, or load a demo dataset.</h2>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-[color:var(--muted)]">
                Demo data fills the timeline with 134 mocked contributions across GitHub, Jira, Slack, Confluence, and manual notes — enough to generate a complete wrap. Everything stays encrypted on this device.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => seedMutation.mutate()}
                  disabled={seedMutation.isPending}
                  className="rounded-full bg-[color:var(--accent)] px-5 py-3 text-sm font-medium text-black disabled:opacity-60"
                >
                  {seedMutation.isPending ? 'Loading demo data…' : 'Try with demo data'}
                </button>
                <button
                  type="button"
                  onClick={() => startFresh.mutate()}
                  disabled={startFresh.isPending}
                  className="rounded-full border border-white/10 px-5 py-3 text-sm text-[color:var(--foreground)]"
                >
                  Start fresh
                </button>
              </div>
              {seedMutation.isError ? <p className="mt-3 text-sm text-[rgb(255,193,168)]">{seedMutation.error.message}</p> : null}
            </section>
          ) : null}

          <ContributionFeed contributions={contributions ?? []} />
        </div>

        <aside className="space-y-6 lg:sticky lg:top-6 lg:self-start">
          <section className="rounded-[30px] border border-[color:var(--border)] bg-[color:var(--surface)]/88 p-6">
            <p className="text-xs uppercase tracking-[0.34em] text-[color:var(--muted)]">Narrative framing</p>
            <h2 className="mt-3 font-display text-3xl text-[color:var(--foreground)]">The product experience should feel evaluative, not ornamental.</h2>
            <p className="mt-4 text-sm leading-7 text-[color:var(--muted)]">This prototype keeps the data close, lets manual evidence enter instantly, and turns the year into a shareable sequence of ten polished slides.</p>
          </section>
          <ManualInputForm />
        </aside>
      </section>
    </main>
  );
}
