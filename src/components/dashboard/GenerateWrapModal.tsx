'use client';

/*
 * Design philosophy: Editorial brutalism softened by institutional modernism.
 * File role: Make wrap generation feel ceremonial and high-value, like initiating a curated review artifact.
 * Guardrail: Distinguish mode choice through hierarchy, contrast, and deliberate pacing.
 */
import { AnimatePresence, motion } from 'framer-motion';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { SliceContent, WrapMode } from '@/lib/types';
import { listContributionsInRange } from '@/lib/local-store/contributions';
import { saveWrap } from '@/lib/local-store/wraps';
import { DEFAULT_MODEL_ID, MODEL_OPTIONS } from '@/lib/ai/models';

const INK = '#0A0A0A';
const CREAM = '#FFF4DE';
const PAPER = '#FBF5E5';
const HOT = '#FF4D2E';

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

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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

  const isControlled = controlledOpen !== undefined;

  return (
    <>
      {!isControlled && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          style={{
            background: HOT,
            border: `2px solid ${INK}`,
            boxShadow: `3px 3px 0 ${INK}`,
            color: CREAM,
            borderRadius: 8,
            padding: '10px 20px',
            fontSize: 14,
            fontWeight: 600,
            fontFamily: 'Space Grotesk, sans-serif',
            cursor: 'pointer',
            transition: 'transform 0.1s, box-shadow 0.1s',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.transform = 'translate(-1px, -1px)';
            (e.currentTarget as HTMLButtonElement).style.boxShadow = `4px 4px 0 ${INK}`;
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.transform = 'translate(0, 0)';
            (e.currentTarget as HTMLButtonElement).style.boxShadow = `3px 3px 0 ${INK}`;
          }}
        >
          Generate Wrap
        </button>
      )}

      <AnimatePresence>
        {open ? (
          <motion.div
            style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(10,10,10,0.6)', padding: '0 16px' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
          >
            <motion.div
              onClick={(e) => e.stopPropagation()}
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              style={{
                width: '100%',
                maxWidth: 640,
                background: CREAM,
                border: `2px solid ${INK}`,
                boxShadow: `6px 6px 0 ${INK}`,
                borderRadius: 24,
                padding: 28,
                maxHeight: '90vh',
                overflowY: 'auto',
              }}
            >
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
                <div>
                  <p style={{
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: 9,
                    textTransform: 'uppercase',
                    letterSpacing: '0.12em',
                    color: INK,
                    opacity: 0.5,
                    margin: 0,
                  }}>Wrap generator</p>
                  <h2 style={{
                    fontFamily: 'Space Grotesk, sans-serif',
                    fontSize: 32,
                    fontWeight: 700,
                    color: INK,
                    marginTop: 8,
                    marginBottom: 0,
                    lineHeight: 1.15,
                  }}>Pick the lens for this story.</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: INK,
                    fontSize: 13,
                    fontFamily: 'Space Grotesk, sans-serif',
                    cursor: 'pointer',
                    opacity: 0.55,
                    padding: '4px 0',
                    flexShrink: 0,
                  }}
                >
                  Close
                </button>
              </div>

              {/* Mode cards */}
              <div style={{ marginTop: 24, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {modeCards.map((card) => {
                  const selected = mode === card.value;
                  return (
                    <button
                      key={card.value}
                      type="button"
                      onClick={() => setMode(card.value)}
                      style={{
                        background: selected ? '#FFF0E8' : PAPER,
                        border: `2px solid ${selected ? HOT : INK}`,
                        boxShadow: selected ? `3px 3px 0 ${HOT}` : `3px 3px 0 ${INK}`,
                        borderRadius: 14,
                        padding: '18px 20px',
                        textAlign: 'left',
                        cursor: 'pointer',
                        transition: 'border-color 0.1s, box-shadow 0.1s',
                      }}
                    >
                      <p style={{
                        fontFamily: 'JetBrains Mono, monospace',
                        fontSize: 9,
                        textTransform: 'uppercase',
                        letterSpacing: '0.12em',
                        color: selected ? HOT : INK,
                        opacity: selected ? 1 : 0.5,
                        margin: 0,
                      }}>{card.description}</p>
                      <h3 style={{
                        fontFamily: 'Space Grotesk, sans-serif',
                        fontSize: 22,
                        fontWeight: 700,
                        color: INK,
                        margin: '6px 0 0',
                      }}>{card.title}</h3>
                      <p style={{
                        fontFamily: 'Space Grotesk, sans-serif',
                        fontSize: 13,
                        color: INK,
                        opacity: 0.6,
                        margin: '8px 0 0',
                      }}>{card.detail}</p>
                    </button>
                  );
                })}
              </div>

              {/* Date range / year-end notice */}
              {mode === 'snapshot' ? (
                <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <label style={{ display: 'grid', gap: 6 }}>
                    <span style={{
                      fontFamily: 'JetBrains Mono, monospace',
                      fontSize: 9,
                      textTransform: 'uppercase',
                      letterSpacing: '0.12em',
                      color: INK,
                      opacity: 0.55,
                    }}>From</span>
                    <input
                      type="date"
                      value={windowStart}
                      onChange={(event) => setWindowStart(event.target.value)}
                      style={{
                        background: 'white',
                        border: `2px solid ${INK}`,
                        borderRadius: 8,
                        padding: '10px 14px',
                        fontFamily: 'Space Grotesk, sans-serif',
                        fontSize: 14,
                        color: INK,
                        outline: 'none',
                      }}
                      onFocus={(e) => { e.currentTarget.style.borderColor = HOT; }}
                      onBlur={(e) => { e.currentTarget.style.borderColor = INK; }}
                    />
                  </label>
                  <label style={{ display: 'grid', gap: 6 }}>
                    <span style={{
                      fontFamily: 'JetBrains Mono, monospace',
                      fontSize: 9,
                      textTransform: 'uppercase',
                      letterSpacing: '0.12em',
                      color: INK,
                      opacity: 0.55,
                    }}>To</span>
                    <input
                      type="date"
                      value={windowEnd}
                      onChange={(event) => setWindowEnd(event.target.value)}
                      style={{
                        background: 'white',
                        border: `2px solid ${INK}`,
                        borderRadius: 8,
                        padding: '10px 14px',
                        fontFamily: 'Space Grotesk, sans-serif',
                        fontSize: 14,
                        color: INK,
                        outline: 'none',
                      }}
                      onFocus={(e) => { e.currentTarget.style.borderColor = HOT; }}
                      onBlur={(e) => { e.currentTarget.style.borderColor = INK; }}
                    />
                  </label>
                </div>
              ) : (
                <div style={{
                  marginTop: 20,
                  background: PAPER,
                  border: `2px solid ${INK}`,
                  borderRadius: 10,
                  padding: '12px 16px',
                  fontFamily: 'Space Grotesk, sans-serif',
                  fontSize: 13,
                  color: INK,
                  opacity: 0.7,
                }}>
                  Year-End automatically uses the full 2025 calendar year.
                </div>
              )}

              {/* Model selector */}
              <label style={{ display: 'grid', gap: 6, marginTop: 20 }}>
                <span style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: 9,
                  textTransform: 'uppercase',
                  letterSpacing: '0.12em',
                  color: INK,
                  opacity: 0.55,
                }}>Model</span>
                <select
                  value={modelId}
                  onChange={(event) => setModelId(event.target.value)}
                  style={{
                    background: 'white',
                    border: `2px solid ${INK}`,
                    borderRadius: 8,
                    padding: '10px 14px',
                    fontFamily: 'Space Grotesk, sans-serif',
                    fontSize: 14,
                    color: INK,
                    outline: 'none',
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = HOT; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = INK; }}
                >
                  {MODEL_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <span style={{
                  fontFamily: 'Space Grotesk, sans-serif',
                  fontSize: 11,
                  color: INK,
                  opacity: 0.5,
                }}>
                  Anthropic models use ANTHROPIC_API_KEY. Azure Foundry options call your project&apos;s Azure OpenAI deployment of the same name via AZURE_FOUNDRY_PROJECT_ENDPOINT and DefaultAzureCredential (Entra ID). Override AZURE_FOUNDRY_API_VERSION if your deployment requires a different api-version.
                </span>
              </label>

              {/* Status panel */}
              <div style={{
                marginTop: 20,
                background: PAPER,
                border: `2px solid ${INK}`,
                borderRadius: 14,
                padding: '16px 18px',
              }}>
                {status === 'idle' ? (
                  <p style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 13, color: INK, opacity: 0.65, margin: 0 }}>
                    Your contributions are sent to the AI proxy without identifiers; the result is stored encrypted on this device.
                  </p>
                ) : null}
                {status === 'loading' ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'Space Grotesk, sans-serif', fontSize: 13, color: INK }}>
                    <span style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      background: HOT,
                      animation: 'pulse 1.2s ease-in-out infinite',
                    }} />
                    Generating your wrap…{' '}
                    <span style={{ opacity: 0.55 }}>~20 seconds</span>
                  </div>
                ) : null}
                {status === 'error' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <p style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 13, color: HOT, margin: 0 }}>{errorMessage}</p>
                    <button
                      type="button"
                      onClick={generate}
                      style={{
                        alignSelf: 'flex-start',
                        background: PAPER,
                        border: `2px solid ${INK}`,
                        boxShadow: `3px 3px 0 ${INK}`,
                        borderRadius: 8,
                        padding: '6px 14px',
                        fontFamily: 'Space Grotesk, sans-serif',
                        fontSize: 13,
                        color: INK,
                        cursor: 'pointer',
                      }}
                    >
                      Retry
                    </button>
                  </div>
                ) : null}
                {status === 'success' && wrapId ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <p style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 13, color: INK, margin: 0 }}>Your wrap is ready. Saved on this device.</p>
                    <Link
                      href={`/wrap?id=${wrapId}`}
                      style={{
                        alignSelf: 'flex-start',
                        display: 'inline-flex',
                        alignItems: 'center',
                        background: '#C6FF3B',
                        border: `2px solid ${INK}`,
                        boxShadow: `3px 3px 0 ${INK}`,
                        borderRadius: 8,
                        padding: '6px 14px',
                        fontFamily: 'Space Grotesk, sans-serif',
                        fontSize: 13,
                        fontWeight: 600,
                        color: INK,
                        textDecoration: 'none',
                      }}
                    >
                      View Wrap →
                    </Link>
                  </div>
                ) : null}
              </div>

              {/* Generate button */}
              <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={generate}
                  disabled={status === 'loading'}
                  style={{
                    background: HOT,
                    border: `2px solid ${INK}`,
                    boxShadow: `3px 3px 0 ${INK}`,
                    borderRadius: 8,
                    padding: '10px 24px',
                    fontFamily: 'Space Grotesk, sans-serif',
                    fontSize: 14,
                    fontWeight: 700,
                    color: CREAM,
                    cursor: status === 'loading' ? 'not-allowed' : 'pointer',
                    opacity: status === 'loading' ? 0.6 : 1,
                    transition: 'transform 0.1s, box-shadow 0.1s',
                  }}
                  onMouseEnter={(e) => {
                    if (status !== 'loading') {
                      (e.currentTarget as HTMLButtonElement).style.transform = 'translate(-1px, -1px)';
                      (e.currentTarget as HTMLButtonElement).style.boxShadow = `4px 4px 0 ${INK}`;
                    }
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.transform = 'translate(0, 0)';
                    (e.currentTarget as HTMLButtonElement).style.boxShadow = `3px 3px 0 ${INK}`;
                  }}
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
