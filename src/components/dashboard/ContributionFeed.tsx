'use client';

/*
 * Design philosophy: Editorial brutalism softened by institutional modernism.
 * File role: Render the contribution history like an annotated evidence ledger with staggered hierarchy.
 * Guardrail: Dense information should feel composed and breathable, never like a generic task list.
 */
import { AnimatePresence, motion } from 'framer-motion';
import { formatDistanceToNowStrict, startOfWeek, format } from 'date-fns';
import { useMemo, useState } from 'react';
import type { Contribution } from '@/lib/types';

const sourceStyles: Record<string, string> = {
  github: 'bg-[rgba(124,58,237,0.18)] text-[rgb(196,181,253)]',
  jira: 'bg-[rgba(14,165,233,0.18)] text-[rgb(125,211,252)]',
  slack: 'bg-[rgba(16,185,129,0.18)] text-[rgb(110,231,183)]',
  confluence: 'bg-[rgba(20,184,166,0.18)] text-[rgb(153,246,228)]',
  manual: 'bg-[rgba(255,107,53,0.18)] text-[rgb(255,193,168)]',
};

function weightDots(weight: number) {
  return Array.from({ length: 5 }, (_, index) => (
    <span
      key={index}
      className={`h-1.5 w-1.5 rounded-full ${index < weight ? 'bg-[var(--accent)]' : 'bg-white/10'}`}
    />
  ));
}

function groupByWeek(items: Contribution[]) {
  const grouped = new Map<string, Contribution[]>();

  items.forEach((item) => {
    const weekKey = startOfWeek(new Date(item.occurredAt), { weekStartsOn: 1 }).toISOString();
    const bucket = grouped.get(weekKey) ?? [];
    bucket.push(item);
    grouped.set(weekKey, bucket);
  });

  return Array.from(grouped.entries()).sort((a, b) => +new Date(b[0]) - +new Date(a[0]));
}

export function ContributionFeed({ contributions }: { contributions: Contribution[] }) {
  const [visibleWeeks, setVisibleWeeks] = useState(8);
  const groups = useMemo(() => groupByWeek(contributions), [contributions]);
  const visibleGroups = groups.slice(0, visibleWeeks);

  return (
    <div className="grain rounded-[28px] border border-[color:var(--border)] bg-[color:var(--surface)]/86 p-5 shadow-glow md:p-7">
      <div className="mb-6 flex items-end justify-between gap-4 border-b border-white/6 pb-4">
        <div>
          <p className="text-xs uppercase tracking-[0.34em] text-[color:var(--muted)]">Contribution timeline</p>
          <h2 className="mt-2 font-display text-[clamp(1.8rem,3vw,2.6rem)] leading-none text-[color:var(--foreground)]">
            The past twelve months, surfaced as evidence.
          </h2>
        </div>
        <div className="text-right text-sm text-[color:var(--muted)]">
          <div>{contributions.length} total signals</div>
          <div>{groups.length} active weeks</div>
        </div>
      </div>

      <div className="space-y-8">
        <AnimatePresence mode="popLayout">
          {visibleGroups.map(([weekKey, items], groupIndex) => (
            <motion.section
              key={weekKey}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.35, delay: groupIndex * 0.04 }}
              className="grid gap-4 lg:grid-cols-[200px_minmax(0,1fr)]"
            >
              <div className="pt-1">
                <p className="text-xs uppercase tracking-[0.32em] text-[color:var(--muted)]">{format(new Date(weekKey), "'Week of' d MMM")}</p>
                <p className="mt-2 text-sm text-[color:var(--muted)]">{items.length} contributions logged</p>
              </div>
              <div className="space-y-3">
                {items.map((item) => (
                  <article
                    key={item.id}
                    className="grid gap-3 rounded-[22px] border border-white/7 bg-white/[0.02] px-4 py-4 transition duration-300 hover:border-white/12 hover:bg-white/[0.035] md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-start"
                  >
                    <div className={`inline-flex w-fit items-center rounded-full px-2.5 py-1 text-[0.65rem] font-medium uppercase tracking-[0.24em] ${sourceStyles[item.source]}`}>
                      {item.source}
                    </div>
                    <div className="min-w-0">
                      <p className="line-clamp-2 text-base leading-7 text-[color:var(--foreground)]">{item.signal}</p>
                      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.2em] text-[color:var(--muted)]">
                        <span className="rounded-full border border-white/10 px-2.5 py-1 text-[0.68rem]">{item.category}</span>
                        <span>{formatDistanceToNowStrict(new Date(item.occurredAt), { addSuffix: true })}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 md:justify-end">{weightDots(item.weight)}</div>
                  </article>
                ))}
              </div>
            </motion.section>
          ))}
        </AnimatePresence>
      </div>

      {visibleWeeks < groups.length ? (
        <button
          type="button"
          onClick={() => setVisibleWeeks((current) => current + 4)}
          className="mt-8 inline-flex rounded-full border border-white/10 px-5 py-2.5 text-sm text-[color:var(--foreground)] transition hover:border-[color:var(--accent)] hover:text-[color:var(--accent)]"
        >
          Load more weeks
        </button>
      ) : null}
    </div>
  );
}
