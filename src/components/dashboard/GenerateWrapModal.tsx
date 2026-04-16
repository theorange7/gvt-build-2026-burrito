'use client';

/*
 * Design philosophy: Editorial brutalism softened by institutional modernism.
 * File role: Make wrap generation feel ceremonial and high-value, like initiating a curated review artifact.
 * Guardrail: Distinguish mode choice through hierarchy, contrast, and deliberate pacing.
 */
import { AnimatePresence, motion } from 'framer-motion';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { WrapMode } from '@/lib/types';

const DEFAULT_SNAPSHOT_START = '2025-04-01';
const DEFAULT_SNAPSHOT_END = '2025-06-30';

type Status = 'idle' | 'loading' | 'success' | 'error';

export function GenerateWrapModal({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<WrapMode>('snapshot');
  const [windowStart, setWindowStart] = useState(DEFAULT_SNAPSHOT_START);
  const [windowEnd, setWindowEnd] = useState(DEFAULT_SNAPSHOT_END);
  const [status, setStatus] = useState<Status>('idle');
  const [jobId, setJobId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const payload = useMemo(() => {
    if (mode === 'year-end') {
      return { userId, mode, windowStart: '2025-01-01', windowEnd: '2025-12-31' };
    }

    return { userId, mode, windowStart, windowEnd };
  }, [mode, userId, windowEnd, windowStart]);

  const snapshotWindowIsValid = mode === 'year-end' || new Date(windowStart) <= new Date(windowEnd);

  function resetState(nextMode: WrapMode = mode) {
    setMode(nextMode);
    setWindowStart(DEFAULT_SNAPSHOT_START);
    setWindowEnd(DEFAULT_SNAPSHOT_END);
    setStatus('idle');
    setJobId(null);
    setErrorMessage(null);
  }

  function openModal() {
    resetState();
    setOpen(true);
  }

  function closeModal() {
    setOpen(false);
    resetState();
  }

  async function generate() {
    if (!snapshotWindowIsValid) {
      setStatus('error');
      setErrorMessage('The end date must be on or after the start date.');
      return;
    }

    setStatus('loading');
    setJobId(null);
    setErrorMessage(null);

    try {
      const response = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        setStatus('error');
        setErrorMessage(body.errorMessage || body.error || 'Wrap generation failed.');
        return;
      }

      setJobId(body.jobId);
      setStatus('success');
    } catch {
      setStatus('error');
      setErrorMessage('The wrap service could not be reached. Please try again.');
    }
  }

  const modeCards = [
    {
      value: 'snapshot' as const,
      title: 'Snapshot',
      description: 'Any time window',
      detail: 'Stat-forward, personal check-in',
    },
    {
      value: 'year-end' as const,
      title: 'Year-End',
      description: 'Full year 2025',
      detail: 'Editorial, appraisal-ready',
    },
  ];

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className="rounded-full bg-[color:var(--accent)] px-5 py-3 text-sm font-medium text-black transition hover:translate-y-[-1px]"
      >
        Generate Wrap
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4 backdrop-blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              className="w-full max-w-2xl rounded-[30px] border border-white/10 bg-[#111118]/96 p-6 shadow-[0_40px_140px_rgba(0,0,0,0.55)]"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.34em] text-[color:var(--muted)]">Wrap generator</p>
                  <h2 className="mt-2 font-display text-4xl text-[color:var(--foreground)]">Pick the lens for this story.</h2>
                </div>
                <button type="button" onClick={closeModal} className="text-sm text-[color:var(--muted)] transition hover:text-[color:var(--foreground)]">Close</button>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                {modeCards.map((card) => (
                  <button
                    key={card.value}
                    type="button"
                    onClick={() => {
                      setMode(card.value);
                      setStatus('idle');
                      setJobId(null);
                      setErrorMessage(null);
                    }}
                    className={`rounded-[24px] border p-5 text-left transition ${mode === card.value ? 'border-[color:var(--accent)] bg-[rgba(255,107,53,0.08)]' : 'border-white/10 bg-black/15 hover:border-white/20'}`}
                  >
                    <p className="text-xs uppercase tracking-[0.32em] text-[color:var(--muted)]">{card.description}</p>
                    <h3 className="mt-2 font-display text-2xl text-[color:var(--foreground)]">{card.title}</h3>
                    <p className="mt-3 text-sm leading-6 text-[color:var(--muted)]">{card.detail}</p>
                  </button>
                ))}
              </div>

              {mode === 'snapshot' ? (
                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  <label className="grid gap-2 text-sm text-[color:var(--muted)]">
                    From
                    <input type="date" value={windowStart} onChange={(event) => setWindowStart(event.target.value)} className="rounded-[18px] border border-white/10 bg-black/20 px-4 py-3 text-[color:var(--foreground)] outline-none focus:border-[color:var(--accent)]" />
                  </label>
                  <label className="grid gap-2 text-sm text-[color:var(--muted)]">
                    To
                    <input type="date" value={windowEnd} onChange={(event) => setWindowEnd(event.target.value)} className="rounded-[18px] border border-white/10 bg-black/20 px-4 py-3 text-[color:var(--foreground)] outline-none focus:border-[color:var(--accent)]" />
                  </label>
                </div>
              ) : (
                <div className="mt-6 rounded-[22px] border border-white/8 bg-black/15 px-4 py-4 text-sm text-[color:var(--muted)]">Year-End automatically uses the full 2025 calendar year.</div>
              )}

              <div className="mt-6 rounded-[24px] border border-white/8 bg-black/20 p-5">
                {status === 'idle' ? <p className="text-sm text-[color:var(--muted)]">You’ll get a local microsite with 10 mode-aware slides and live narrative copy.</p> : null}
                {status === 'loading' ? (
                  <div className="flex items-center gap-3 text-sm text-[color:var(--foreground)]">
                    <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[color:var(--accent)]" />
                    Generating your wrap… <span className="text-[color:var(--muted)]">~20 seconds</span>
                  </div>
                ) : null}
                {status === 'error' ? (
                  <div className="space-y-3 text-sm">
                    <p className="text-[rgb(255,193,168)]">{errorMessage}</p>
                    <button type="button" onClick={generate} className="rounded-full border border-white/10 px-4 py-2 text-[color:var(--foreground)]">Retry</button>
                  </div>
                ) : null}
                {status === 'success' && jobId ? (
                  <div className="space-y-3 text-sm">
                    <p className="text-[color:var(--foreground)]">Your wrap is ready.</p>
                    <Link href={`/wrap/${jobId}`} className="inline-flex rounded-full bg-[color:var(--accent)] px-4 py-2 text-black">View Wrap →</Link>
                  </div>
                ) : null}
              </div>

              {!snapshotWindowIsValid ? (
                <p className="mt-4 text-sm text-[rgb(255,193,168)]">Choose a valid snapshot window before generating.</p>
              ) : null}

              <div className="mt-6 flex justify-end">
                <button
                  type="button"
                  onClick={generate}
                  disabled={status === 'loading' || !snapshotWindowIsValid}
                  className="rounded-full bg-[color:var(--accent)] px-5 py-3 text-sm font-medium text-black transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Generate
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
