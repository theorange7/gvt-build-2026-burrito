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

  return (
    <div className="rounded-[24px] border border-[color:var(--border)] bg-[color:var(--surface)]/90 p-5">
      <div className="flex items-center justify-between">
        <h4 className="font-display text-lg">Backfill historical events</h4>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-white/10 px-3 py-1 text-xs text-[color:var(--muted)]"
        >
          Cancel
        </button>
      </div>
      <form
        className="mt-4 grid gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate();
        }}
      >
        <label className="grid gap-1 text-sm">
          <span className="text-[color:var(--muted)]">Start date</span>
          <input
            type="date"
            value={startStr}
            onChange={(event) => setStartStr(event.target.value)}
            className="rounded-[14px] border border-white/10 bg-black/20 px-3 py-2 text-[color:var(--foreground)] outline-none focus:border-[color:var(--accent)]"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-[color:var(--muted)]">End date</span>
          <input
            type="date"
            value={endStr}
            onChange={(event) => setEndStr(event.target.value)}
            className="rounded-[14px] border border-white/10 bg-black/20 px-3 py-2 text-[color:var(--foreground)] outline-none focus:border-[color:var(--accent)]"
          />
        </label>

        {preview && !preview.invalid ? (
          preview.covered ? (
            <p role="status" className="text-sm text-[color:var(--muted)]">
              This range is already covered by stored backfills — will skip.
            </p>
          ) : (
            <p role="status" className="text-sm text-[color:var(--muted)]">
              {preview.gaps.length === 1
                ? `Will fetch the uncovered window: ${formatDate(preview.gaps[0][0])} → ${formatDate(preview.gaps[0][1])}.`
                : `Will fetch ${preview.gaps.length} uncovered gap${preview.gaps.length === 1 ? '' : 's'}.`}
            </p>
          )
        ) : null}
        {preview?.invalid ? (
          <p role="alert" className="text-sm text-[rgb(255,193,168)]">
            End date must be after start date.
          </p>
        ) : null}

        {mutation.isError ? (
          <p role="alert" className="text-sm text-[rgb(255,193,168)]">
            {mutation.error instanceof Error ? mutation.error.message : 'Backfill failed.'}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={mutation.isPending || preview?.invalid}
          className="rounded-full bg-[color:var(--accent)] px-4 py-2 text-sm font-medium text-black disabled:cursor-not-allowed disabled:opacity-60"
        >
          {mutation.isPending ? 'Backfilling…' : 'Backfill'}
        </button>
      </form>
    </div>
  );
}
