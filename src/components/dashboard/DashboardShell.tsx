'use client';

/*
 * Design philosophy: Editorial brutalism softened by institutional modernism.
 * File role: Compose the dashboard shell so live data, authored framing, and manual input share one deliberate rhythm.
 * Guardrail: Preserve the publication-like structure while enabling immediate interaction feedback.
 */
import { ContributionFeed } from '@/components/dashboard/ContributionFeed';
import { GenerateWrapModal } from '@/components/dashboard/GenerateWrapModal';
import { ManualInputForm } from '@/components/dashboard/ManualInputForm';
import { useContributions } from '@/components/dashboard/useContributions';
import type { Contribution } from '@/lib/types';

export function DashboardShell({ initialContributions }: { initialContributions: Contribution[] }) {
  const { data } = useContributions(initialContributions);
  const contributions = data ?? initialContributions;

  return (
    <main className="mx-auto min-h-screen max-w-[1480px] px-4 py-6 md:px-8 md:py-8">
      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.45fr)_360px]">
        <div className="space-y-6">
          <header className="grid gap-6 rounded-[34px] border border-[color:var(--border)] bg-[color:var(--surface)]/78 p-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start lg:p-8">
            <div>
              <p className="text-xs uppercase tracking-[0.36em] text-[color:var(--muted)]">Wrapped for Work</p>
              <h1 className="mt-3 max-w-4xl font-display text-[clamp(3.1rem,7vw,5.7rem)] leading-[0.9] text-[color:var(--foreground)]">
                A year of contribution, staged like a record worth keeping.
              </h1>
            </div>
            <div className="flex items-start justify-end lg:pt-1">
              <GenerateWrapModal />
            </div>
            <div className="grid gap-4 border-t border-white/6 pt-6 md:grid-cols-3 lg:col-span-2">
              <div>
                <p className="text-xs uppercase tracking-[0.32em] text-[color:var(--muted)]">Mode contrast</p>
                <p className="mt-2 text-sm leading-6 text-[color:var(--foreground)]">Snapshot reads like a dense pulse check; Year-End reads like a polished performance narrative.</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.32em] text-[color:var(--muted)]">Source coverage</p>
                <p className="mt-2 text-sm leading-6 text-[color:var(--foreground)]">Mocked GitHub, Jira, Slack, Confluence, and manual signals across the full 2025 calendar year.</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.32em] text-[color:var(--muted)]">Demo user</p>
                <p className="mt-2 text-sm leading-6 text-[color:var(--foreground)]">All flows run for <span className="text-[color:var(--accent)]">demo-user</span> so the local prototype feels complete with zero setup friction.</p>
              </div>
            </div>
          </header>

          <ContributionFeed contributions={contributions} />
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
