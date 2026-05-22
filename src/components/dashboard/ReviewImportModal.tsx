'use client';

/*
 * Spec 50 follow-up — review-and-confirm modal for file-upload imports.
 *
 * After the server extracts contributions, the import queue parks the
 * row in `awaiting-review` status and exposes the rows via
 * useImportQueue().pendingReview. This modal renders that review and
 * lets the user edit every field (date, signal, category, weight,
 * source) before the rows hit the encrypted store. Rows the LLM could
 * not date are auto-dated to today and flagged with a chip so the user
 * sees at a glance which rows want a real date.
 *
 * The modal is mounted from ImportQueueProvider, not from the page tree,
 * so it follows the queue wherever the provider goes — no need to
 * remember to add it to every layout.
 *
 * Cancel triggers ImportCancelledError on the runner; the queue then
 * marks the row as failed with error='cancelled'. We deliberately do
 * not show a "cancel everything" affordance — each upload is reviewed
 * individually, in the order extraction completed.
 */
import { useEffect, useState } from 'react';
import type { ContributionCategory, ContributionSource } from '@/lib/types';
import type { NormalizedContribution } from '@/lib/providers/types';
import {
  useImportQueue,
  type PendingReview,
  type ReviewableContribution,
} from './ImportQueueContext';

const INK = '#0A0A0A';
const CREAM = '#FFF4DE';
const PAPER = '#FBF5E5';
const HOT = '#FF4D2E';
const LIME = '#C6FF3B';

const CATEGORIES: ContributionCategory[] = [
  'delivery',
  'collaboration',
  'mentorship',
  'process',
  'leadership',
  'other',
];

/** Local editable shape for a single row in the modal. */
type Draft = {
  occurredAt: string; // yyyy-mm-dd for <input type="date">
  signal: string;
  category: ContributionCategory;
  weight: number;
  source: ContributionSource;
  rawData: Record<string, unknown>;
  externalId?: string;
  externalUrl?: string;
  autoDated: boolean;
};

function toIsoDateInput(d: Date): string {
  // yyyy-mm-dd in the user's local timezone — what <input type="date"> expects.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fromIsoDateInput(s: string): Date {
  // Treat the user-entered date as local midnight; downstream code keeps
  // it in the same timezone the user picked.
  const [y, m, d] = s.split('-').map((p) => Number(p));
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function reviewableToDraft(row: ReviewableContribution): Draft {
  return {
    occurredAt: toIsoDateInput(row.occurredAt),
    signal: row.signal,
    category: row.category,
    weight: row.weight,
    source: row.source,
    rawData: row.rawData,
    externalId: row.externalId,
    externalUrl: row.externalUrl,
    autoDated: row.autoDated,
  };
}

function draftToContribution(d: Draft): NormalizedContribution {
  return {
    signal: d.signal.trim(),
    rawData: d.rawData,
    source: d.source.trim(),
    category: d.category,
    weight: d.weight,
    occurredAt: fromIsoDateInput(d.occurredAt),
    externalId: d.externalId,
    externalUrl: d.externalUrl,
  };
}

export function ReviewImportModal() {
  const { pendingReview, confirmReview, cancelReview } = useImportQueue();
  return pendingReview ? (
    <ReviewImportModalInner
      pendingReview={pendingReview}
      onConfirm={confirmReview}
      onCancel={cancelReview}
    />
  ) : null;
}

/**
 * Inner component remounts (via React key) whenever the review id
 * changes — that way the local edit state resets cleanly when the next
 * queued review surfaces.
 */
function ReviewImportModalInner({
  pendingReview,
  onConfirm,
  onCancel,
}: {
  pendingReview: PendingReview;
  onConfirm: (id: string, rows: NormalizedContribution[]) => void;
  onCancel: (id: string) => void;
}) {
  return (
    <ModalBody
      key={pendingReview.id}
      pendingReview={pendingReview}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}

function ModalBody({
  pendingReview,
  onConfirm,
  onCancel,
}: {
  pendingReview: PendingReview;
  onConfirm: (id: string, rows: NormalizedContribution[]) => void;
  onCancel: (id: string) => void;
}) {
  const [drafts, setDrafts] = useState<Draft[]>(() =>
    pendingReview.rows.map(reviewableToDraft),
  );

  // Esc closes (treated as cancel — the user is bailing out of the review).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel(pendingReview.id);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onCancel, pendingReview.id]);

  function updateDraft(index: number, patch: Partial<Draft>) {
    setDrafts((prev) =>
      prev.map((d, i) => (i === index ? { ...d, ...patch } : d)),
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const rows = drafts
      .filter((d) => d.signal.trim().length > 0)
      .map(draftToContribution);
    onConfirm(pendingReview.id, rows);
  }

  const autoDatedCount = drafts.filter((d) => d.autoDated).length;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="review-import-heading"
      data-testid="review-import-modal"
      style={{
        position: 'fixed', inset: 0, zIndex: 300,
        background: 'rgba(10,10,10,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '24px 16px',
      }}
    >
      <div style={{
        background: PAPER, border: `2px solid ${INK}`, boxShadow: `6px 6px 0 ${INK}`,
        borderRadius: 20, padding: '24px 28px', maxWidth: 880, width: '100%',
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        fontFamily: 'Space Grotesk, sans-serif',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: '0.14em', color: HOT, fontWeight: 700, margin: 0 }}>
            REVIEW · {pendingReview.label.toUpperCase()}
          </p>
          <button
            type="button"
            onClick={() => onCancel(pendingReview.id)}
            aria-label="Cancel review"
            style={{
              background: 'transparent', border: 'none', fontSize: 22,
              cursor: 'pointer', color: INK, lineHeight: 1, padding: 4,
            }}
          >✕</button>
        </div>

        <h2 id="review-import-heading" style={{
          fontFamily: 'Space Grotesk, sans-serif', fontSize: 22, fontWeight: 700,
          color: INK, margin: '0 0 6px',
        }}>
          {drafts.length} contribution{drafts.length === 1 ? '' : 's'} extracted — give them a quick look.
        </h2>

        <p style={{ margin: '0 0 14px', fontSize: 13, color: INK, opacity: 0.7, lineHeight: 1.5 }}>
          Confirm the dates and details before they land in your timeline.
          {autoDatedCount > 0 && (
            <>
              {' '}
              <strong>{autoDatedCount}</strong> row{autoDatedCount === 1 ? '' : 's'} couldn&apos;t be dated automatically — they&apos;re set to today, but you should pick the real date.
            </>
          )}
        </p>

        <form
          onSubmit={handleSubmit}
          data-testid="review-import-form"
          style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
        >
          <div style={{
            overflow: 'auto', flex: 1, minHeight: 0,
            display: 'flex', flexDirection: 'column', gap: 12,
            paddingRight: 4,
          }}>
            {drafts.map((d, i) => (
              <DraftRow
                key={i}
                index={i}
                draft={d}
                onChange={(patch) => updateDraft(i, patch)}
              />
            ))}
            {drafts.length === 0 && (
              <p style={{
                fontFamily: 'JetBrains Mono, monospace', fontSize: 12,
                color: INK, opacity: 0.55, padding: '16px 0', margin: 0,
              }}>
                The model returned no contributions. Cancel to discard, or save to record an empty import.
              </p>
            )}
          </div>

          <div style={{
            display: 'flex', gap: 10, justifyContent: 'flex-end',
            paddingTop: 14, borderTop: `2px solid ${INK}`, marginTop: 14,
          }}>
            <button
              type="button"
              onClick={() => onCancel(pendingReview.id)}
              style={{
                background: PAPER, border: `2px solid ${INK}`, borderRadius: 10,
                padding: '10px 18px', fontFamily: 'Space Grotesk, sans-serif',
                fontSize: 13, fontWeight: 600, color: INK, cursor: 'pointer',
              }}
            >
              cancel
            </button>
            <button
              type="submit"
              data-testid="review-confirm"
              style={{
                background: HOT, border: `2px solid ${INK}`, borderRadius: 10,
                boxShadow: `3px 3px 0 ${INK}`, padding: '10px 22px',
                fontFamily: 'Space Grotesk, sans-serif', fontSize: 14, fontWeight: 700,
                color: CREAM, cursor: 'pointer',
              }}
            >
              confirm & save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DraftRow({
  index,
  draft,
  onChange,
}: {
  index: number;
  draft: Draft;
  onChange: (patch: Partial<Draft>) => void;
}) {
  return (
    <div
      data-testid="review-import-row"
      data-auto-dated={draft.autoDated ? 'true' : 'false'}
      style={{
        background: '#fff', border: `2px solid ${INK}`, borderRadius: 12,
        padding: '12px 14px', display: 'grid',
        gridTemplateColumns: '140px 1fr 160px 90px 130px',
        gap: 10, alignItems: 'start',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <label style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.08em', color: INK, opacity: 0.55 }}>
          DATE
        </label>
        <input
          type="date"
          value={draft.occurredAt}
          onChange={(e) => onChange({ occurredAt: e.target.value, autoDated: false })}
          aria-label={`Date for row ${index + 1}`}
          style={{
            background: '#fff', border: `1.5px solid ${INK}`, borderRadius: 6,
            padding: '6px 8px', fontSize: 12, color: INK, outline: 'none',
            fontFamily: 'JetBrains Mono, monospace',
          }}
        />
        {draft.autoDated && (
          <span
            data-testid="auto-dated-flag"
            style={{
              fontFamily: 'JetBrains Mono, monospace', fontSize: 9, fontWeight: 700,
              color: INK, background: LIME, border: `1px solid ${INK}`, borderRadius: 4,
              padding: '2px 6px', alignSelf: 'flex-start', letterSpacing: '0.06em',
            }}
          >
            AUTO-DATED
          </span>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <label style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.08em', color: INK, opacity: 0.55 }}>
          SIGNAL
        </label>
        <textarea
          value={draft.signal}
          onChange={(e) => onChange({ signal: e.target.value })}
          rows={2}
          aria-label={`Signal for row ${index + 1}`}
          style={{
            background: '#fff', border: `1.5px solid ${INK}`, borderRadius: 6,
            padding: '6px 8px', fontSize: 13, color: INK, outline: 'none',
            fontFamily: 'Space Grotesk, sans-serif', resize: 'vertical',
            minHeight: 36,
          }}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <label style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.08em', color: INK, opacity: 0.55 }}>
          CATEGORY
        </label>
        <select
          value={draft.category}
          onChange={(e) => onChange({ category: e.target.value as ContributionCategory })}
          aria-label={`Category for row ${index + 1}`}
          style={{
            background: '#fff', border: `1.5px solid ${INK}`, borderRadius: 6,
            padding: '6px 8px', fontSize: 12, color: INK, outline: 'none',
            fontFamily: 'JetBrains Mono, monospace',
          }}
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <label style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.08em', color: INK, opacity: 0.55 }}>
          WEIGHT
        </label>
        <input
          type="number"
          min={1}
          max={5}
          step={1}
          value={draft.weight}
          onChange={(e) => {
            const n = Number(e.target.value);
            onChange({ weight: Number.isFinite(n) ? n : draft.weight });
          }}
          aria-label={`Weight for row ${index + 1}`}
          style={{
            background: '#fff', border: `1.5px solid ${INK}`, borderRadius: 6,
            padding: '6px 8px', fontSize: 12, color: INK, outline: 'none',
            fontFamily: 'JetBrains Mono, monospace',
          }}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <label style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.08em', color: INK, opacity: 0.55 }}>
          SOURCE
        </label>
        <input
          type="text"
          value={draft.source}
          onChange={(e) => onChange({ source: e.target.value })}
          aria-label={`Source for row ${index + 1}`}
          style={{
            background: '#fff', border: `1.5px solid ${INK}`, borderRadius: 6,
            padding: '6px 8px', fontSize: 12, color: INK, outline: 'none',
            fontFamily: 'JetBrains Mono, monospace',
          }}
        />
      </div>
    </div>
  );
}
