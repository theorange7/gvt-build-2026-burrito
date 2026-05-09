'use client';

/*
 * Design philosophy: Editorial brutalism softened by institutional modernism.
 * File role: Offer a quiet authoring surface that feels like appending a line to an annual record.
 * Guardrail: The form should feel intentional and lightweight, not like a noisy admin widget.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { Contribution, ContributionCategory } from '@/lib/types';
import { addContribution } from '@/lib/local-store/contributions';

const INK = '#0A0A0A';
const CREAM = '#FFF4DE';
const PAPER = '#FBF5E5';
const HOT = '#FF4D2E';
const LIME = '#C6FF3B';

const categories: ContributionCategory[] = ['delivery', 'collaboration', 'mentorship', 'process', 'leadership'];

type Classification = {
  signal: string;
  category: ContributionCategory;
  weight: number;
};

export function ManualInputForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [freeText, setFreeText] = useState('');
  const [occurredAt, setOccurredAt] = useState(new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState('');

  const mutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/classify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ freeText, source: 'manual' }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Classification failed.' }));
        throw new Error(error.error || 'Classification failed.');
      }

      const classified = (await response.json()) as Classification;

      return addContribution({
        source: 'manual',
        category: (category as ContributionCategory) || classified.category,
        signal: classified.signal,
        rawData: { source: 'manual', freeText },
        occurredAt: new Date(occurredAt),
        weight: classified.weight,
        externalId: `manual:${crypto.randomUUID()}`,
      });
    },
    onSuccess: (created) => {
      queryClient.setQueryData<Contribution[]>(['contributions'], (current = []) => [created, ...current]);
      setFreeText('');
      setCategory('');
    },
  });

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Reset success state when modal opens
  useEffect(() => {
    if (open) mutation.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(10,10,10,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '24px 16px',
      }}
    >
      <div style={{
        background: PAPER,
        border: `2px solid ${INK}`,
        boxShadow: `6px 6px 0 ${INK}`,
        borderRadius: 20,
        padding: '28px 32px',
        width: '100%',
        maxWidth: 560,
        maxHeight: '90vh',
        overflowY: 'auto',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.12em', color: INK, opacity: 0.5, margin: '0 0 6px' }}>
              Manual note
            </p>
            <h3 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 22, fontWeight: 700, color: INK, margin: 0 }}>
              Add the work that systems miss.
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: CREAM, border: `2px solid ${INK}`, boxShadow: `2px 2px 0 ${INK}`,
              borderRadius: 8, width: 36, height: 36, cursor: 'pointer',
              fontFamily: 'JetBrains Mono, monospace', fontSize: 16, color: INK,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}
          >
            ✕
          </button>
        </div>

        <form
          style={{ display: 'grid', gap: 14 }}
          onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }}
        >
          <div style={{ display: 'grid', gap: 6 }}>
            <label style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.12em', color: INK, opacity: 0.55 }}>
              Contribution
            </label>
            <textarea
              required
              value={freeText}
              onChange={(e) => setFreeText(e.target.value)}
              placeholder="Describe a contribution..."
              rows={4}
              style={{
                minHeight: 140, background: 'white', border: `2px solid ${INK}`,
                borderRadius: 8, padding: '12px 14px',
                fontFamily: 'Space Grotesk, sans-serif', fontSize: 14, color: INK,
                outline: 'none', resize: 'vertical',
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = HOT; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = INK; }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ display: 'grid', gap: 6 }}>
              <label style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.12em', color: INK, opacity: 0.55 }}>
                Date
              </label>
              <input
                type="date"
                value={occurredAt}
                onChange={(e) => setOccurredAt(e.target.value)}
                style={{
                  background: 'white', border: `2px solid ${INK}`, borderRadius: 8,
                  padding: '10px 14px', fontFamily: 'Space Grotesk, sans-serif',
                  fontSize: 14, color: INK, outline: 'none',
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = HOT; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = INK; }}
              />
            </div>

            <div style={{ display: 'grid', gap: 6 }}>
              <label style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.12em', color: INK, opacity: 0.55 }}>
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                style={{
                  background: 'white', border: `2px solid ${INK}`, borderRadius: 8,
                  padding: '10px 14px', fontFamily: 'Space Grotesk, sans-serif',
                  fontSize: 14, color: INK, outline: 'none',
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = HOT; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = INK; }}
              >
                <option value="">Let AI classify it</option>
                {categories.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Category quick-select badges */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {categories.map((item) => {
              const selected = category === item;
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => setCategory(selected ? '' : item)}
                  style={{
                    background: selected ? HOT : CREAM,
                    border: `2px solid ${INK}`,
                    boxShadow: selected ? `2px 2px 0 ${INK}` : 'none',
                    borderRadius: 5, padding: '4px 10px',
                    fontFamily: 'JetBrains Mono, monospace', fontSize: 10,
                    textTransform: 'uppercase', letterSpacing: '0.1em',
                    color: selected ? CREAM : INK, cursor: 'pointer',
                  }}
                >
                  {item}
                </button>
              );
            })}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginTop: 4 }}>
            <p style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 12, color: INK, opacity: 0.55, margin: 0, flex: 1 }}>
              Classified on save. Stored only on this device.
            </p>
            <button
              type="submit"
              disabled={mutation.isPending || !freeText.trim()}
              style={{
                background: HOT, border: `2px solid ${INK}`, boxShadow: `3px 3px 0 ${INK}`,
                borderRadius: 8, padding: '10px 20px',
                fontFamily: 'Space Grotesk, sans-serif', fontSize: 14, fontWeight: 700,
                color: CREAM, cursor: mutation.isPending || !freeText.trim() ? 'not-allowed' : 'pointer',
                opacity: mutation.isPending || !freeText.trim() ? 0.6 : 1, flexShrink: 0,
              }}
            >
              {mutation.isPending ? 'Adding…' : 'Add Contribution'}
            </button>
          </div>

          {mutation.isError && (
            <p style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 13, color: HOT, margin: 0 }}>
              {mutation.error.message}
            </p>
          )}

          {mutation.isSuccess && (
            <div style={{
              background: LIME, border: `2px solid ${INK}`, borderRadius: 8,
              padding: '10px 14px', fontFamily: 'Space Grotesk, sans-serif',
              fontSize: 13, fontWeight: 600, color: INK,
            }}>
              Contribution saved. Add another or close.
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
