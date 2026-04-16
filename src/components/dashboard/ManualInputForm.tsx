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
import { contributionsQueryKey } from '@/components/dashboard/useContributions';

const categories: ContributionCategory[] = ['delivery', 'collaboration', 'mentorship', 'process', 'leadership'];

export function ManualInputForm({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [freeText, setFreeText] = useState('');
  const [occurredAt, setOccurredAt] = useState(new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState('');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const resetForm = () => {
    setFreeText('');
    setOccurredAt(new Date().toISOString().slice(0, 10));
    setCategory('');
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/contributions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          userId,
          freeText: freeText.trim(),
          occurredAt,
          category: category || undefined,
        }),
      });

      const body = await response.json().catch(() => ({ error: 'Failed to add contribution.' }));

      if (!response.ok) {
        throw new Error(body.error || 'Failed to add contribution.');
      }

      return body as Contribution;
    },
    onMutate: () => {
      setSuccessMessage(null);
    },
    onSuccess: async (created) => {
      queryClient.setQueryData<Contribution[]>(contributionsQueryKey, (current = []) => [created, ...current]);
      await queryClient.invalidateQueries({ queryKey: contributionsQueryKey });
      resetForm();
      setOpen(false);
      setSuccessMessage('Contribution added to the timeline.');
    },
  });

  const toggleOpen = () => {
    setOpen((current) => !current);
    mutation.reset();
    setSuccessMessage(null);
  };

  return (
    <section className="rounded-[28px] border border-[color:var(--border)] bg-[color:var(--surface)]/78 p-5 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.32em] text-[color:var(--muted)]">Manual note</p>
          <h3 className="mt-2 font-display text-2xl text-[color:var(--foreground)]">Add the work that systems miss.</h3>
        </div>
        <button
          type="button"
          onClick={toggleOpen}
          className="rounded-full border border-white/10 px-4 py-2 text-sm text-[color:var(--foreground)] transition hover:border-[color:var(--accent)] hover:text-[color:var(--accent)]"
        >
          {open ? 'Hide form' : 'Add contribution'}
        </button>
      </div>

      {successMessage ? <p className="mt-4 text-sm text-[color:var(--accent)]">{successMessage}</p> : null}

      {open ? (
        <motion.form
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="mt-5 grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate();
          }}
        >
          <textarea
            required
            value={freeText}
            onChange={(event) => setFreeText(event.target.value)}
            placeholder="Describe a contribution..."
            rows={4}
            className="min-h-[140px] rounded-[22px] border border-white/10 bg-black/20 px-4 py-4 text-[color:var(--foreground)] outline-none transition placeholder:text-white/30 focus:border-[color:var(--accent)]"
          />
          <div className="grid gap-4 md:grid-cols-2">
            <input
              type="date"
              value={occurredAt}
              onChange={(event) => setOccurredAt(event.target.value)}
              className="rounded-[18px] border border-white/10 bg-black/20 px-4 py-3 text-[color:var(--foreground)] outline-none transition focus:border-[color:var(--accent)]"
            />
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="rounded-[18px] border border-white/10 bg-black/20 px-4 py-3 text-[color:var(--foreground)] outline-none transition focus:border-[color:var(--accent)]"
            >
              <option value="">Let AI classify it</option>
              {categories.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-[color:var(--muted)]">Entries are classified on save and added straight into the timeline.</p>
            <button
              type="submit"
              disabled={mutation.isPending || !freeText.trim()}
              className="rounded-full bg-[color:var(--accent)] px-5 py-3 text-sm font-medium text-black transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {mutation.isPending ? 'Adding…' : 'Add Contribution'}
            </button>
          </div>
          {mutation.isError ? <p className="text-sm text-[rgb(255,193,168)]">{mutation.error.message}</p> : null}
        </motion.form>
      ) : null}
    </section>
  );
}
