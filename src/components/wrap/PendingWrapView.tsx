'use client';

/*
 * Design philosophy: Editorial brutalism softened by institutional modernism.
 * File role: Hold space while the backing service generates the wrap, signaling
 * progress without competing with the eventual viewer.
 * Guardrail: The pending screen should feel intentional, not like a generic spinner.
 */
import Link from 'next/link';
import type { WrapMode } from '@/lib/types';
import { usePendingWrap } from '@/lib/local-store/hooks';

export function PendingWrapView({ id, mode }: { id: string; mode: WrapMode }) {
  const state = usePendingWrap(id);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0a0a0f] px-4 text-center text-white">
      <div className="w-full max-w-xl rounded-[28px] border border-white/10 bg-[#111118] px-8 py-10">
        <p className="text-xs uppercase tracking-[0.36em] text-white/45">
          {mode === 'year-end' ? 'Year-End wrap' : 'Snapshot wrap'}
        </p>
        <h1 className="mt-4 font-display text-4xl">
          {state.phase === 'failed'
            ? 'Generation failed.'
            : state.phase === 'paused-locked'
              ? 'Unlock to continue.'
              : 'Generating your wrap…'}
        </h1>

        {state.phase === 'paused-locked' ? (
          <p className="mt-6 text-sm text-white/65">
            Your wrap is still being generated. Unlock your local store to save it when it&apos;s ready.
          </p>
        ) : null}

        {state.phase === 'loading' || state.phase === 'queued' || state.phase === 'running' ? (
          <div className="mt-6 flex items-center justify-center gap-3 text-sm text-white/65">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[color:var(--accent)]" />
            {state.phase === 'loading'
              ? 'Checking status…'
              : 'busy' in state && state.busy
                ? "We're a little busy — this might take longer than usual."
                : state.phase === 'queued'
                  ? 'Queued — picking it up shortly.'
                  : 'Drafting your slices.'}
          </div>
        ) : null}

        {state.phase === 'failed' ? (
          <div className="mt-6 space-y-4 text-sm text-white/65">
            <p className="text-[rgb(255,193,168)]">{state.error}</p>
            <Link href="/dashboard" className="inline-flex rounded-full border border-white/10 px-4 py-2 text-white">
              Back to dashboard
            </Link>
          </div>
        ) : null}

        {state.phase === 'complete' ? (
          <p className="mt-6 text-sm text-white/65">Your wrap is ready. Loading…</p>
        ) : null}
      </div>
    </main>
  );
}
