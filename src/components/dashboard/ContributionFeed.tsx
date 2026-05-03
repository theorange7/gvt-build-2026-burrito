'use client';

/*
 * Design philosophy: Maximalist editorial - bold borders, hard shadows, cream backgrounds.
 * File role: Render the contribution history as week-grouped maximalist cards.
 * Guardrail: Visual density should feel composed, never like a generic task list.
 */
import { AnimatePresence, motion } from 'framer-motion';
import { formatDistanceToNowStrict, startOfWeek, format } from 'date-fns';
import { useMemo, useState } from 'react';
import type { Contribution } from '@/lib/types';

// ---------------------------------------------------------------------------
// Palette type (inlined - must stay in sync with DashboardShell)
// ---------------------------------------------------------------------------

interface MxPalette {
  id: string; label: string; sub: string;
  hot: string; lime: string; ink: string; cream: string; paper: string;
  accent: string; accent2: string; accent3: string;
  swatch: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sourceToKind(source: string): string {
  const map: Record<string, string> = {
    github: 'PR', gitlab: 'MR', jira: 'TICKET', slack: 'CHAT', confluence: 'DOC', manual: 'NOTE',
  };
  return map[source] ?? source.toUpperCase().slice(0, 6);
}

type ContributionCategory = Contribution['category'];

function categoryColor(cat: ContributionCategory, p: MxPalette): string {
  const map: Record<ContributionCategory, string> = {
    delivery: p.hot, collaboration: p.lime, leadership: p.accent,
    mentorship: p.accent2, process: p.accent3, other: p.ink,
  };
  return map[cat] ?? p.ink;
}

function weightDots(weight: number, p: MxPalette) {
  return Array.from({ length: 5 }, (_, index) => (
    <span
      key={index}
      style={{
        display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
        background: index < weight ? p.hot : p.ink + '22',
        border: '1px solid ' + (index < weight ? p.hot : p.ink),
        opacity: index < weight ? 1 : 0.3,
      }}
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

// ---------------------------------------------------------------------------
// Single contribution card
// ---------------------------------------------------------------------------

function ContributionCard({ item, p, onOpen }: { item: Contribution; p: MxPalette; onOpen?: (c: Contribution) => void }) {
  const [hovered, setHovered] = useState(false);
  const kind = sourceToKind(item.source);
  const color = categoryColor(item.category, p);
  const needsDarkText = color === p.lime || color === p.accent2;

  return (
    <article
      role={onOpen ? 'button' : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onClick={() => onOpen?.(item)}
      onKeyDown={(e) => e.key === 'Enter' && onOpen?.(item)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        cursor: onOpen ? 'pointer' : 'default',
        display: 'grid', gridTemplateColumns: 'auto 1fr auto', alignItems: 'start', gap: 14,
        background: '#fff', border: '2px solid ' + p.ink, borderRadius: 14,
        boxShadow: hovered ? '2px 2px 0 ' + p.ink : '3px 3px 0 ' + p.ink,
        padding: '14px 16px',
        transform: hovered ? 'translate(-1px, -1px)' : 'translate(0, 0)',
        transition: 'transform 0.12s ease, box-shadow 0.12s ease',
      }}
    >
      <div style={{ paddingTop: 2 }}>
        <span style={{ display: 'inline-block', fontFamily: 'JetBrains Mono, monospace', fontSize: 9, fontWeight: 700, color: needsDarkText ? p.ink : '#fff', background: color, border: '1.5px solid ' + p.ink, borderRadius: 5, padding: '2px 7px', letterSpacing: '0.1em', whiteSpace: 'nowrap' }}>
          {kind}
        </span>
      </div>
      <div style={{ minWidth: 0 }}>
        <p style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 14, fontWeight: 500, color: p.ink, lineHeight: 1.5, margin: '0 0 8px' }}>
          {item.signal}
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: p.ink, border: '1.5px solid ' + p.ink, borderRadius: 5, padding: '1px 6px', opacity: 0.55, letterSpacing: '0.08em' }}>
            #{item.category}
          </span>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: p.ink, opacity: 0.4 }}>
            {formatDistanceToNowStrict(new Date(item.occurredAt), { addSuffix: true })}
          </span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 3, alignItems: 'center', paddingTop: 3 }}>
        {weightDots(item.weight, p)}
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Main feed component
// ---------------------------------------------------------------------------

export function ContributionFeed({ contributions, p, onOpen }: { contributions: Contribution[]; p: MxPalette; onOpen?: (c: Contribution) => void }) {
  const [visibleWeeks, setVisibleWeeks] = useState(8);
  const groups = useMemo(() => groupByWeek(contributions), [contributions]);
  const visibleGroups = groups.slice(0, visibleWeeks);

  return (
    <div style={{ background: p.cream, border: '2px solid ' + p.ink, borderRadius: 18, boxShadow: '4px 4px 0 ' + p.ink, padding: '20px 24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, borderBottom: '2px solid ' + p.ink, paddingBottom: 14, marginBottom: 20 }}>
        <div>
          <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, fontWeight: 700, color: p.ink, letterSpacing: '0.14em', margin: '0 0 4px', opacity: 0.6 }}>
            CONTRIBUTION TIMELINE
          </p>
          <h2 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 'clamp(1.4rem, 2.5vw, 2rem)', fontWeight: 700, color: p.ink, lineHeight: 1.1, margin: 0 }}>
            The past twelve months.
          </h2>
        </div>
        <div style={{ textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: p.ink, opacity: 0.5, lineHeight: 1.7, flexShrink: 0 }}>
          <div>{contributions.length} total signals</div>
          <div>{groups.length} active weeks</div>
        </div>
      </div>

      {/* Week groups */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
        <AnimatePresence mode="popLayout">
          {visibleGroups.map(([weekKey, items], groupIndex) => (
            <motion.section
              key={weekKey}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.3, delay: groupIndex * 0.04 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, fontWeight: 700, color: p.ink, background: p.paper, border: '1.5px solid ' + p.ink, borderRadius: 5, padding: '2px 7px', letterSpacing: '0.1em' }}>
                  {format(new Date(weekKey), "'WK OF' d MMM").toUpperCase()}
                </span>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: p.ink, opacity: 0.4 }}>
                  {items.length} contribution{items.length !== 1 ? 's' : ''}
                </span>
                <div style={{ flex: 1, height: 1, background: p.ink + '18' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {items.map((item) => (
                  <ContributionCard key={item.id} item={item} p={p} onOpen={onOpen} />
                ))}
              </div>
            </motion.section>
          ))}
        </AnimatePresence>
      </div>

      {visibleWeeks < groups.length && (
        <button
          type="button"
          onClick={() => setVisibleWeeks((current) => current + 4)}
          style={{ marginTop: 20, background: p.paper, border: '2px solid ' + p.ink, borderRadius: 10, boxShadow: '3px 3px 0 ' + p.ink, padding: '10px 22px', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, fontWeight: 700, color: p.ink, cursor: 'pointer', letterSpacing: '0.1em' }}
        >
          LOAD MORE WEEKS
        </button>
      )}
    </div>
  );
}
