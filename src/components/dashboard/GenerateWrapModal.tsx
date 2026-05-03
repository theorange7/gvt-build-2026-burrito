'use client';

/*
 * Design philosophy: Editorial brutalism softened by institutional modernism.
 * File role: Make wrap generation feel ceremonial and high-value, like initiating a curated review artifact.
 * Guardrail: Distinguish mode choice through hierarchy, contrast, and deliberate pacing.
 */
import { AnimatePresence, motion } from 'framer-motion';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { SliceContent, WrapMode } from '@/lib/types';
import { listContributionsInRange } from '@/lib/local-store/contributions';
import { saveWrap } from '@/lib/local-store/wraps';
import { DEFAULT_MODEL_ID, MODEL_OPTIONS } from '@/lib/ai/models';

interface GenerateWrapModalProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function GenerateWrapModal({ open: controlledOpen, onOpenChange }: GenerateWrapModalProps = {}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (val: boolean) => {
    setInternalOpen(val);
    onOpenChange?.(val);
  };
  const [mode, setMode] = useState<WrapMode>('snapshot');
  const [windowStart, setWindowStart] = useState('2025-04-01');
  const [windowEnd, setWindowEnd] = useState('2025-06-30');
  const [modelId, setModelId] = useState<string>(DEFAULT_MODEL_ID);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [wrapId, setWrapId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const range = useMemo(() => {
    if (mode === 'year-end') {
      return { windowStart: '2025-01-01', windowEnd: '2025-12-31' };
    }
    return { windowStart, windowEnd };
  }, [mode, windowEnd, windowStart]);

  async function generate() {
    setStatus('loading');
    setErrorMessage(null);

    try {
      const start = new Date(range.windowStart);
      const end = new Date(range.windowEnd);
      end.setHours(23, 59, 59, 999);

      const local = await listContributionsInRange(start, end);
      const stripped = local.map((c) => ({
        source: c.source,
        category: c.category,
        signal: c.signal,
        rawData: c.rawData,
        occurredAt: c.occurredAt.toISOString(),
        weight: c.weight,
      }));

      const response = await fetch('/api/wrap', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contributions: stripped,
          mode,
          windowStart: start.toISOString(),
          windowEnd: end.toISOString(),
          modelId,
        }),
      });

      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        setStatus('error');
        setErrorMessage(body.error || 'Wrap generation failed.');
        return;
      }

      const sliceContent = body.sliceContent as SliceContent[];
      const title = mode === 'year-end' ? 'Your year, wrapped for work.' : 'Your recent momentum, wrapped.';
      const stored = await saveWrap({
        mode,
        windowStart: start,
        windowEnd: end,
        title,
        sliceContent,
      });

      setWrapId(stored.id);
      setStatus('success');
    } catch (error) {
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'Wrap generation failed.');
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
        onClick={() => setOpen(true)}
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
                <button type="button" onClick={() => setOpen(false)} className="text-sm text-[color:var(--muted)] transition hover:text-[color:var(--foreground)]">Close</button>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                {modeCards.map((card) => (
                  <button
                    key={card.value}
                    type="button"
                    onClick={() => setMode(card.value)}
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

              <label className="mt-6 grid gap-2 text-sm text-[color:var(--muted)]">
                Model
                <select
                  value={modelId}
                  onChange={(event) => setModelId(event.target.value)}
                  className="rounded-[18px] border border-white/10 bg-black/20 px-4 py-3 text-[color:var(--foreground)] outline-none focus:border-[color:var(--accent)]"
                >
                  {MODEL_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id} className="bg-[#111118]">
                      {option.label}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-[color:var(--muted)]">
                  Anthropic models use ANTHROPIC_API_KEY. Azure Foundry options call your project&apos;s Azure OpenAI deployment of the same name via AZURE_FOUNDRY_PROJECT_ENDPOINT and DefaultAzureCredential (Entra ID). Override AZURE_FOUNDRY_API_VERSION if your deployment requires a different api-version.
                </span>
              </label>

              <div className="mt-6 rounded-[24px] border border-white/8 bg-black/20 p-5">
                {status === 'idle' ? <p className="text-sm text-[color:var(--muted)]">Your contributions are sent to the AI proxy without identifiers; the result is stored encrypted on this device.</p> : null}
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
                {status === 'success' && wrapId ? (
                  <div className="space-y-3 text-sm">
                    <p className="text-[color:var(--foreground)]">Your wrap is ready. Saved on this device.</p>
                    <Link href={`/wrap?id=${wrapId}`} className="inline-flex rounded-full bg-[color:var(--accent)] px-4 py-2 text-black">View Wrap →</Link>
                  </div>
                ) : null}
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  type="button"
                  onClick={generate}
                  disabled={status === 'loading'}
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
