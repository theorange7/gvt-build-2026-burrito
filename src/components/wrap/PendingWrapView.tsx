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
    <main
      style={{ background: '#FFF4DE' }}
      className="flex min-h-screen items-center justify-center px-4 text-center"
    >
      <div
        style={{
          background: '#FBF5E5',
          border: '2px solid #0A0A0A',
          boxShadow: '4px 4px 0 #0A0A0A',
        }}
        className="w-full max-w-xl px-8 py-10"
      >
        <p
          style={{ fontFamily: 'JetBrains Mono, monospace', color: '#0A0A0A' }}
          className="text-xs uppercase tracking-[0.36em] opacity-60"
        >
          {mode === 'year-end' ? 'Year-End wrap' : 'Snapshot wrap'}
        </p>
        <h1
          style={{ fontFamily: 'Space Grotesk, sans-serif', color: '#0A0A0A' }}
          className="mt-4 text-4xl font-black leading-tight"
        >
          {state.phase === 'failed' ? 'Generation failed.' : 'Generating your wrap…'}
        </h1>

        {state.phase === 'loading' || state.phase === 'queued' || state.phase === 'running' ? (
          <div
            style={{ fontFamily: 'JetBrains Mono, monospace', color: '#0A0A0A' }}
            className="mt-6 flex items-center justify-center gap-3 text-xs uppercase tracking-[0.18em]"
          >
            <span
              style={{ background: '#FF4D2E' }}
              className="inline-block h-2.5 w-2.5 animate-pulse"
            />
            <span className="opacity-75">
              {state.phase === 'loading'
                ? 'Checking status…'
                : 'busy' in state && state.busy
                  ? "We're a little busy — this might take longer than usual."
                  : state.phase === 'queued'
                    ? 'Queued — picking it up shortly.'
                    : 'Drafting your slices.'}
            </span>
          </div>
        ) : null}

        {state.phase === 'paused-locked' ? (
          <div
            style={{ fontFamily: 'JetBrains Mono, monospace', color: '#0A0A0A' }}
            className="mt-6 space-y-1 text-xs leading-7 opacity-70"
          >
            <p>Your wrap is still generating.</p>
            <p>Unlock your local store to resume.</p>
          </div>
        ) : null}

        {state.phase === 'failed' ? (
          <div className="mt-6 space-y-5">
            <p
              style={{ fontFamily: 'JetBrains Mono, monospace', color: '#FF4D2E' }}
              className="text-xs leading-6"
            >
              {state.error}
            </p>
            <Link
              href="/dashboard"
              style={{
                fontFamily: 'JetBrains Mono, monospace',
                background: '#FF4D2E',
                border: '2px solid #0A0A0A',
                boxShadow: '3px 3px 0 #0A0A0A',
                color: '#0A0A0A',
              }}
              className="inline-block px-6 py-2.5 text-xs uppercase tracking-[0.18em] font-bold hover:translate-x-[1px] hover:translate-y-[1px] transition-transform"
            >
              ← Back to Dashboard
            </Link>
          </div>
        ) : null}

        {state.phase === 'complete' ? (
          <p
            style={{ fontFamily: 'JetBrains Mono, monospace', color: '#0A0A0A' }}
            className="mt-6 text-xs uppercase tracking-[0.18em] opacity-70"
          >
            Your wrap is ready. Loading…
          </p>
        ) : null}
      </div>
    </main>
  );
}
