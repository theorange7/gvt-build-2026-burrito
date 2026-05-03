'use client';

/*
 * Design philosophy: Editorial brutalism softened by institutional modernism.
 * File role: Offer a quiet authoring surface that feels like appending a line to an annual record.
 * Guardrail: The form should feel intentional and lightweight, not like a noisy admin widget.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { useState } from 'react';
import type { Contribution, ContributionCategory } from '@/lib/types';
import { addContribution } from '@/lib/local-store/contributions';

const INK = '#0A0A0A';
const CREAM = '#FFF4DE';
const PAPER = '#FBF5E5';
const HOT = '#FF4D2E';

const categories: ContributionCategory[] = ['delivery', 'collaboration', 'mentorship', 'process', 'leadership'];

type Classification = {
  signal: string;
  category: ContributionCategory;
  weight: number;
};

export function ManualInputForm() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
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
      setOpen(true);
    },
  });

  return (
    <section style={{
      background: PAPER,
      border: `2px solid ${INK}`,
      boxShadow: `4px 4px 0 ${INK}`,
      borderRadius: 20,
      padding: '20px 24px',
    }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <p style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 9,
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            color: INK,
            opacity: 0.5,
            margin: 0,
          }}>Manual note</p>
          <h3 style={{
            fontFamily: 'Space Grotesk, sans-serif',
            fontSize: 22,
            fontWeight: 700,
            color: INK,
            marginTop: 6,
            marginBottom: 0,
          }}>Add the work that systems miss.</h3>
        </div>
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          style={{
            background: CREAM,
            border: `2px solid ${INK}`,
            boxShadow: `3px 3px 0 ${INK}`,
            borderRadius: 8,
            padding: '8px 16px',
            fontFamily: 'Space Grotesk, sans-serif',
            fontSize: 13,
            fontWeight: 600,
            color: INK,
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
          {open ? 'Hide form' : 'Add contribution'}
        </button>
      </div>

      {open ? (
        <motion.form
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          style={{ marginTop: 20, display: 'grid', gap: 14 }}
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate();
          }}
        >
          <div style={{ display: 'grid', gap: 6 }}>
            <label style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 9,
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              color: INK,
              opacity: 0.55,
            }}>
              Contribution
            </label>
            <textarea
              required
              value={freeText}
              onChange={(event) => setFreeText(event.target.value)}
              placeholder="Describe a contribution..."
              rows={4}
              style={{
                minHeight: 140,
                background: 'white',
                border: `2px solid ${INK}`,
                borderRadius: 8,
                padding: '12px 14px',
                fontFamily: 'Space Grotesk, sans-serif',
                fontSize: 14,
                color: INK,
                outline: 'none',
                resize: 'vertical',
                transition: 'border-color 0.1s',
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = HOT; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = INK; }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ display: 'grid', gap: 6 }}>
              <label style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 9,
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
                color: INK,
                opacity: 0.55,
              }}>
                Date
              </label>
              <input
                type="date"
                value={occurredAt}
                onChange={(event) => setOccurredAt(event.target.value)}
                style={{
                  background: 'white',
                  border: `2px solid ${INK}`,
                  borderRadius: 8,
                  padding: '10px 14px',
                  fontFamily: 'Space Grotesk, sans-serif',
                  fontSize: 14,
                  color: INK,
                  outline: 'none',
                  transition: 'border-color 0.1s',
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = HOT; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = INK; }}
              />
            </div>

            <div style={{ display: 'grid', gap: 6 }}>
              <label style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 9,
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
                color: INK,
                opacity: 0.55,
              }}>
                Category
              </label>
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                style={{
                  background: 'white',
                  border: `2px solid ${INK}`,
                  borderRadius: 8,
                  padding: '10px 14px',
                  fontFamily: 'Space Grotesk, sans-serif',
                  fontSize: 14,
                  color: INK,
                  outline: 'none',
                  transition: 'border-color 0.1s',
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
                    borderRadius: 5,
                    padding: '4px 10px',
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: 10,
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                    color: selected ? CREAM : INK,
                    cursor: 'pointer',
                    transition: 'background 0.1s',
                  }}
                >
                  {item}
                </button>
              );
            })}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <p style={{
              fontFamily: 'Space Grotesk, sans-serif',
              fontSize: 12,
              color: INK,
              opacity: 0.55,
              margin: 0,
              flex: 1,
            }}>
              Entries are classified on save and added straight into the timeline. Stored only on this device.
            </p>
            <button
              type="submit"
              disabled={mutation.isPending || !freeText.trim()}
              style={{
                background: HOT,
                border: `2px solid ${INK}`,
                boxShadow: `3px 3px 0 ${INK}`,
                borderRadius: 8,
                padding: '10px 20px',
                fontFamily: 'Space Grotesk, sans-serif',
                fontSize: 14,
                fontWeight: 700,
                color: CREAM,
                cursor: mutation.isPending || !freeText.trim() ? 'not-allowed' : 'pointer',
                opacity: mutation.isPending || !freeText.trim() ? 0.6 : 1,
                transition: 'transform 0.1s, box-shadow 0.1s',
                flexShrink: 0,
              }}
              onMouseEnter={(e) => {
                if (!mutation.isPending && freeText.trim()) {
                  (e.currentTarget as HTMLButtonElement).style.transform = 'translate(-1px, -1px)';
                  (e.currentTarget as HTMLButtonElement).style.boxShadow = `4px 4px 0 ${INK}`;
                }
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.transform = 'translate(0, 0)';
                (e.currentTarget as HTMLButtonElement).style.boxShadow = `3px 3px 0 ${INK}`;
              }}
            >
              {mutation.isPending ? 'Adding…' : 'Add Contribution'}
            </button>
          </div>

          {mutation.isError ? (
            <p style={{
              fontFamily: 'Space Grotesk, sans-serif',
              fontSize: 13,
              color: HOT,
              margin: 0,
            }}>
              {mutation.error.message}
            </p>
          ) : null}

          {mutation.isSuccess ? (
            <div style={{
              background: '#C6FF3B',
              border: `2px solid ${INK}`,
              borderRadius: 8,
              padding: '10px 14px',
              fontFamily: 'Space Grotesk, sans-serif',
              fontSize: 13,
              fontWeight: 600,
              color: INK,
            }}>
              Contribution saved successfully.
            </div>
          ) : null}
        </motion.form>
      ) : null}
    </section>
  );
}
