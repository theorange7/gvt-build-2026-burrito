'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import {
  computeBackfillGaps,
  listImportedRanges,
  type DateRange,
} from '@/lib/local-store/importedRanges';
import { backfillIdentity } from '@/lib/providers/orchestrator';

type BackfillRangePickerProps = {
  identityId: string;
  onClose: () => void;
};

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function tryParseDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function BackfillRangePicker({ identityId, onClose }: BackfillRangePickerProps) {
  const queryClient = useQueryClient();
  const stored = useLiveQuery(async () => listImportedRanges(identityId), [identityId]);
  const today = new Date();
  const defaultEnd = formatDate(today);
  const defaultStart = formatDate(new Date(today.getFullYear() - 1, today.getMonth(), today.getDate()));
  const [startStr, setStartStr] = useState(defaultStart);
  const [endStr, setEndStr] = useState(defaultEnd);

  const preview = useMemo(() => {
    const start = tryParseDate(startStr);
    const end = tryParseDate(endStr);
    if (!start || !end) return null;
    if (end.getTime() <= start.getTime()) return { invalid: true } as const;
    const existing: DateRange[] = (stored ?? []).map((r) => [r.start, r.end]);
    const result = computeBackfillGaps(existing, start, end);
    return { invalid: false, ...result };
  }, [stored, startStr, endStr]);

  const mutation = useMutation({
    mutationFn: async () => {
      const start = tryParseDate(startStr);
      const end = tryParseDate(endStr);
      if (!start || !end) throw new Error('Pick valid start and end dates.');
      if (end.getTime() <= start.getTime()) {
        throw new Error('End date must be after start date.');
      }
      return backfillIdentity(identityId, { start, end });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contributions'] });
      queryClient.invalidateQueries({ queryKey: ['identities'] });
      onClose();
    },
  });

  const inputStyle: React.CSSProperties = {
    fontFamily: "'Space Grotesk', sans-serif",
    fontSize: 14,
    background: 'white',
    border: '2px solid #0A0A0A',
    borderRadius: 10,
    padding: '8px 12px',
    color: '#0A0A0A',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  };

  return (
    <div
      style={{
        background: '#FBF5E5',
        border: '2px solid #0A0A0A',
        borderRadius: 16,
        boxShadow: '3px 3px 0 #0A0A0A',
        padding: 20,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h4 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 16, fontWeight: 700, color: '#0A0A0A', margin: 0 }}>
          Backfill historical events
        </h4>
        <button
          type="button"
          onClick={onClose}
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 10,
            letterSpacing: '0.1em',
            border: '2px solid #0A0A0A',
            borderRadius: 50,
            padding: '4px 12px',
            background: '#FFF4DE',
            color: '#0A0A0A',
            cursor: 'pointer',
          }}
        >
          CANCEL
        </button>
      </div>
      <form
        style={{ display: 'grid', gap: 12 }}
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate();
        }}
      >
        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#0A0A0A', opacity: 0.6 }}>
            Start date
          </span>
          <input
            type="date"
            value={startStr}
            onChange={(event) => setStartStr(event.target.value)}
            style={inputStyle}
          />
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#0A0A0A', opacity: 0.6 }}>
            End date
          </span>
          <input
            type="date"
            value={endStr}
            onChange={(event) => setEndStr(event.target.value)}
            style={inputStyle}
          />
        </label>

        {preview && !preview.invalid ? (
          preview.covered ? (
            <p role="status" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#0A0A0A', opacity: 0.55 }}>
              This range is already covered by stored backfills — will skip.
            </p>
          ) : (
            <p role="status" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#0A0A0A', opacity: 0.7 }}>
              {preview.gaps.length === 1
                ? `Will fetch the uncovered window: ${formatDate(preview.gaps[0][0])} → ${formatDate(preview.gaps[0][1])}.`
                : `Will fetch ${preview.gaps.length} uncovered gap${preview.gaps.length === 1 ? '' : 's'}.`}
            </p>
          )
        ) : null}
        {preview?.invalid ? (
          <p role="alert" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#FF4D2E' }}>
            End date must be after start date.
          </p>
        ) : null}

        {mutation.isError ? (
          <p role="alert" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#FF4D2E' }}>
            {mutation.error instanceof Error ? mutation.error.message : 'Backfill failed.'}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={mutation.isPending || preview?.invalid}
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.1em',
            background: mutation.isPending || preview?.invalid ? '#FBF5E5' : '#FF4D2E',
            color: mutation.isPending || preview?.invalid ? '#0A0A0A' : '#FFF4DE',
            border: '2px solid #0A0A0A',
            borderRadius: 50,
            padding: '10px 20px',
            cursor: mutation.isPending || preview?.invalid ? 'not-allowed' : 'pointer',
            opacity: mutation.isPending || preview?.invalid ? 0.6 : 1,
          }}
        >
          {mutation.isPending ? 'BACKFILLING…' : 'BACKFILL'}
        </button>
      </form>
    </div>
  );
}
