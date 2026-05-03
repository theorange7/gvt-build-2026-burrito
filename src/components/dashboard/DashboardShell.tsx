'use client';

/*
 * Design philosophy: Maximalist editorial — bold borders, hard shadows, cream backgrounds.
 * File role: Compose the full dashboard shell with nav, hero, year-rhythm chart, events,
 *   sidebar CTA, category breakdown, and stat boxes.
 * Guardrail: All colour values are derived from the active MxPalette so switching palettes
 *   repaints the entire dashboard without hunting for inline hex values.
 */
import { useMutation } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ContributionFeed } from '@/components/dashboard/ContributionFeed';
import { EventDetailDrawer } from '@/components/dashboard/EventDetailDrawer';
import type { DrawerEvent } from '@/components/dashboard/EventDetailDrawer';
import { GenerateWrapModal } from '@/components/dashboard/GenerateWrapModal';
import { ManualInputForm } from '@/components/dashboard/ManualInputForm';
import { useContributions } from '@/components/dashboard/useContributions';
import { isSeeded, markSeeded, seedFromBundledDemo } from '@/lib/local-store/seed';
import type { Contribution, ContributionCategory } from '@/lib/types';

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------

interface MxPalette {
  id: string; label: string; sub: string;
  hot: string; lime: string; ink: string; cream: string; paper: string;
  accent: string; accent2: string; accent3: string;
  swatch: string[];
  [key: string]: unknown;
}

const MX_PALETTES: Record<string, MxPalette> = {
  tomato: {
    id: 'tomato', label: 'Tomato', sub: 'the original',
    hot: '#FF4D2E', lime: '#C6FF3B', ink: '#0A0A0A', cream: '#FFF4DE', paper: '#FBF5E5',
    accent: '#6B3DFF', accent2: '#7BE3FF', accent3: '#FFB3C7',
    swatch: ['#FF4D2E', '#C6FF3B', '#6B3DFF', '#0A0A0A'],
  },
  govtech: {
    id: 'govtech', label: 'GovTech SG', sub: 'indigo + blue',
    hot: '#6137B3', lime: '#3D68BD', ink: '#1A1233', cream: '#F4F1FB', paper: '#E8E2F2',
    accent: '#9D7FE0', accent2: '#7FA3E8', accent3: '#C9BBED',
    swatch: ['#6137B3', '#3D68BD', '#9D7FE0', '#1A1233'],
  },
  soft: {
    id: 'soft', label: 'Soft', sub: 'muted but warm',
    hot: '#D97757', lime: '#D6E4B8', ink: '#2A2620', cream: '#F4EFE6', paper: '#EDE7D9',
    accent: '#7C6FB8', accent2: '#9DC4D8', accent3: '#E8B4B8',
    swatch: ['#D97757', '#D6E4B8', '#7C6FB8', '#2A2620'],
  },
  sunset: {
    id: 'sunset', label: 'Sunset', sub: 'mango + papaya',
    hot: '#F25C54', lime: '#FFD166', ink: '#1F0F2E', cream: '#FFF1E0', paper: '#FCE5CC',
    accent: '#9D4EDD', accent2: '#06A77D', accent3: '#F49AC2',
    swatch: ['#F25C54', '#FFD166', '#9D4EDD', '#1F0F2E'],
  },
};

// ---------------------------------------------------------------------------
// PaletteSwitcher (inline)
// ---------------------------------------------------------------------------

function PaletteSwitcher({ p, onSelect }: { p: MxPalette; onSelect: (id: string) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: p.paper, border: '2px solid ' + p.ink, borderRadius: 8,
          padding: '4px 10px', cursor: 'pointer',
          fontFamily: 'JetBrains Mono, monospace', fontSize: 11, fontWeight: 600, color: p.ink,
          boxShadow: '2px 2px 0 ' + p.ink,
        }}
        aria-label="Switch palette"
      >
        {p.swatch.map((c) => (
          <span key={c} style={{ width: 12, height: 12, borderRadius: '50%', background: c, display: 'inline-block', border: '1px solid ' + p.ink }} />
        ))}
        <span style={{ marginLeft: 4 }}>{p.label}</span>
        <span style={{ marginLeft: 2, opacity: 0.5 }}>&#9662;</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '110%', right: 0,
          background: p.cream, border: '2px solid ' + p.ink, borderRadius: 10,
          boxShadow: '4px 4px 0 ' + p.ink, zIndex: 100, minWidth: 200, overflow: 'hidden',
        }}>
          {Object.values(MX_PALETTES).map((pal) => (
            <button
              key={pal.id}
              type="button"
              onClick={() => { onSelect(pal.id); setOpen(false); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                padding: '10px 14px',
                background: pal.id === p.id ? p.paper : 'transparent',
                border: 'none', cursor: 'pointer',
                fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: p.ink, textAlign: 'left',
              }}
            >
              {pal.swatch.map((c) => (
                <span key={c} style={{ width: 10, height: 10, borderRadius: '50%', background: c, display: 'inline-block', border: '1px solid ' + p.ink }} />
              ))}
              <span style={{ fontWeight: 700 }}>{pal.label}</span>
              <span style={{ opacity: 0.5, marginLeft: 'auto' }}>{pal.sub}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
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

function categoryColor(cat: ContributionCategory, p: MxPalette): string {
  const map: Record<ContributionCategory, string> = {
    delivery: p.hot, collaboration: p.lime, leadership: p.accent,
    mentorship: p.accent2, process: p.accent3, other: p.ink,
  };
  return map[cat] ?? p.ink;
}

function buildMonthlyChart(contributions: Contribution[]): number[] {
  const counts = Array<number>(12).fill(0);
  for (const c of contributions) {
    counts[new Date(c.occurredAt).getMonth()]++;
  }
  return counts;
}

const MONTH_LABELS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function YearRhythmCard({ contributions, p }: { contributions: Contribution[]; p: MxPalette }) {
  const counts = buildMonthlyChart(contributions);
  const max = Math.max(...counts, 1);
  const peakIdx = counts.indexOf(max);

  return (
    <div style={{ background: p.cream, border: '2px solid ' + p.ink, borderRadius: 16, boxShadow: '4px 4px 0 ' + p.ink, padding: '20px 24px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, fontWeight: 700, color: p.ink, letterSpacing: '0.12em' }}>
          YEAR RHYTHM
        </span>
        <div style={{ display: 'flex', gap: 12, fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: p.ink, opacity: 0.7 }}>
          {([['peak', p.hot], ['high', p.accent], ['base', p.ink]] as [string, string][]).map(([label, color]) => (
            <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: color, display: 'inline-block' }} />
              {label}
            </span>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 80 }}>
        {counts.map((count, i) => {
          const ratio = count / max;
          const barH = Math.max(ratio * 72, count > 0 ? 4 : 2);
          const isPeak = i === peakIdx;
          const isHigh = !isPeak && ratio > 0.5;
          const barColor = isPeak ? p.hot : isHigh ? p.accent : p.ink;
          return (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              {isPeak && count > 0 && (
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, fontWeight: 700, color: p.hot, marginBottom: 2 }}>{count}</span>
              )}
              <div style={{ width: '100%', height: barH, background: barColor, borderRadius: '3px 3px 0 0', opacity: count === 0 ? 0.15 : 1, marginTop: 'auto' }} />
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
        {MONTH_LABELS.map((m, i) => (
          <div key={i} style={{ flex: 1, textAlign: 'center', fontFamily: 'JetBrains Mono, monospace', fontSize: 8, color: i === peakIdx ? p.hot : p.ink, opacity: i === peakIdx ? 1 : 0.45, fontWeight: i === peakIdx ? 700 : 400 }}>
            {m}
          </div>
        ))}
      </div>
    </div>
  );
}

function EventRow({ contribution, p, onOpen }: { contribution: Contribution; p: MxPalette; onOpen: (c: Contribution) => void }) {
  const [hovered, setHovered] = useState(false);
  const kind = sourceToKind(contribution.source);
  const color = categoryColor(contribution.category, p);
  const needsDarkText = color === p.lime || color === p.accent2;
  const d = new Date(contribution.occurredAt);
  const dateStr = String(d.getDate()).padStart(2, '0') + ' ' + MONTH_LABELS[d.getMonth()];

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(contribution)}
      onKeyDown={(e) => e.key === 'Enter' && onOpen(contribution)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        background: '#fff', border: '2px solid ' + p.ink, borderRadius: 12,
        boxShadow: hovered ? '2px 2px 0 ' + p.ink : '3px 3px 0 ' + p.ink,
        padding: '10px 14px', cursor: 'pointer',
        transform: hovered ? 'translate(-1px, -1px)' : 'translate(0,0)',
        transition: 'transform 0.12s ease, box-shadow 0.12s ease',
        userSelect: 'none',
      }}
    >
      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: p.ink, opacity: 0.5, minWidth: 44, flexShrink: 0 }}>{dateStr}</span>
      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, fontWeight: 700, color: needsDarkText ? p.ink : '#fff', background: color, borderRadius: 4, padding: '2px 6px', letterSpacing: '0.1em', flexShrink: 0, border: '1.5px solid ' + p.ink }}>{kind}</span>
      <span style={{ flex: 1, fontSize: 13, color: p.ink, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{contribution.signal}</span>
      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: p.ink, opacity: 0.4, flexShrink: 0, border: '1px solid ' + p.ink, borderRadius: 4, padding: '1px 5px' }}>#{contribution.category}</span>
      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: p.ink, opacity: 0.35, flexShrink: 0 }}>&#8594;</span>
    </div>
  );
}

function WrapCtaCard({ p, onWrap }: { p: MxPalette; onWrap?: (mode: 'phone' | 'desktop') => void }) {
  return (
    <div style={{ background: p.hot, border: '2px solid ' + p.ink, borderRadius: 16, boxShadow: '4px 4px 0 ' + p.ink, padding: '24px 24px 20px' }}>
      <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, fontWeight: 700, color: p.cream, letterSpacing: '0.14em', opacity: 0.8, marginBottom: 8, margin: '0 0 8px' }}>READY ENOUGH</p>
      <h2 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 32, fontWeight: 700, color: p.cream, lineHeight: 1.1, margin: '0 0 10px' }}>wrap your year so far.</h2>
      <p style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 14, color: p.cream, opacity: 0.85, margin: '0 0 20px', lineHeight: 1.5 }}>7 highlight slides. ready in 60 seconds...</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button type="button" onClick={() => onWrap?.('desktop')} style={{ background: p.lime, border: '2px solid ' + p.ink, borderRadius: 10, boxShadow: '3px 3px 0 ' + p.ink, padding: '12px 20px', fontFamily: 'Space Grotesk, sans-serif', fontSize: 15, fontWeight: 700, color: p.ink, cursor: 'pointer', letterSpacing: '0.02em' }}>
          WRAP IT &#127791;
        </button>
        <button type="button" onClick={() => onWrap?.('phone')} style={{ background: '#fff', border: '2px solid ' + p.ink, borderRadius: 10, padding: '10px 20px', fontFamily: 'Space Grotesk, sans-serif', fontSize: 13, fontWeight: 600, color: p.ink, cursor: 'pointer' }}>
          watch full-screen &#9654;
        </button>
      </div>
    </div>
  );
}

function CategoryBreakdownCard({ p }: { p: MxPalette }) {
  const categories: { label: string; pct: number; color: string }[] = [
    { label: 'shipping', pct: 42, color: p.hot },
    { label: 'reviews', pct: 21, color: p.lime },
    { label: 'strategy', pct: 17, color: p.accent },
    { label: 'people', pct: 12, color: p.accent2 },
    { label: 'craft', pct: 8, color: p.accent3 },
  ];
  return (
    <div style={{ background: p.cream, border: '2px solid ' + p.ink, borderRadius: 16, boxShadow: '4px 4px 0 ' + p.ink, padding: '20px 24px' }}>
      <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, fontWeight: 700, color: p.ink, letterSpacing: '0.12em', marginBottom: 14, margin: '0 0 14px' }}>BY CATEGORY</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {categories.map(({ label, pct, color }) => (
          <div key={label}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: p.ink, fontWeight: 600 }}>{label}</span>
              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: p.ink, opacity: 0.6 }}>{pct}%</span>
            </div>
            <div style={{ height: 6, background: p.ink + '18', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: pct + '%', background: color, borderRadius: 3 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatBox({ bg, textColor, label, value, sub, p }: { bg: string; textColor: string; label: string; value: string; sub: string; p: MxPalette }) {
  return (
    <div style={{ background: bg, border: '2px solid ' + p.ink, borderRadius: 14, boxShadow: '4px 4px 0 ' + p.ink, padding: '18px 18px 14px' }}>
      <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, fontWeight: 700, color: textColor, letterSpacing: '0.14em', opacity: 0.8, marginBottom: 6, margin: '0 0 6px' }}>{label}</p>
      <p style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 36, fontWeight: 700, color: textColor, lineHeight: 1, marginBottom: 4, margin: '0 0 4px' }}>{value}</p>
      <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: textColor, opacity: 0.65, margin: 0 }}>{sub}</p>
    </div>
  );
}

function FirstRunPanel({
  seedMutation,
  startFresh,
  p,
}: {
  seedMutation: { isPending: boolean; isError: boolean; error: Error | null; mutate: () => void };
  startFresh: { isPending: boolean; mutate: () => void };
  p: MxPalette;
}) {
  return (
    <div style={{ background: p.cream, border: '2px solid ' + p.ink, borderRadius: 16, boxShadow: '4px 4px 0 ' + p.ink, padding: '24px 28px' }}>
      <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: '0.14em', color: p.hot, fontWeight: 700, marginBottom: 8, margin: '0 0 8px' }}>FIRST LAUNCH</p>
      <h2 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 24, fontWeight: 700, color: p.ink, marginBottom: 10, margin: '0 0 10px' }}>Start fresh or load demo data.</h2>
      <p style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 14, color: p.ink, opacity: 0.65, lineHeight: 1.6, marginBottom: 18, margin: '0 0 18px' }}>
        Demo data fills the timeline with 134 mocked contributions. Everything stays encrypted on this device.
      </p>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending}
          style={{ background: p.hot, border: '2px solid ' + p.ink, borderRadius: 10, boxShadow: '3px 3px 0 ' + p.ink, padding: '10px 20px', fontFamily: 'Space Grotesk, sans-serif', fontSize: 14, fontWeight: 700, color: '#fff', cursor: seedMutation.isPending ? 'not-allowed' : 'pointer', opacity: seedMutation.isPending ? 0.6 : 1 }}>
          {seedMutation.isPending ? 'Loading...' : 'Try with demo data'}
        </button>
        <button type="button" onClick={() => startFresh.mutate()} disabled={startFresh.isPending}
          style={{ background: p.paper, border: '2px solid ' + p.ink, borderRadius: 10, padding: '10px 20px', fontFamily: 'Space Grotesk, sans-serif', fontSize: 14, fontWeight: 600, color: p.ink, cursor: 'pointer' }}>
          Start fresh
        </button>
      </div>
      {seedMutation.isError && seedMutation.error && (
        <p style={{ marginTop: 12, fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: p.hot, margin: '12px 0 0' }}>{seedMutation.error.message}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main shell
// ---------------------------------------------------------------------------

export function DashboardShell() {
  const { data: contributions } = useContributions();
  const [paletteId, setPaletteId] = useState<string>('tomato');
  const [seedChecked, setSeedChecked] = useState(false);
  const [showFirstRun, setShowFirstRun] = useState(false);
  const [showManualInput, setShowManualInput] = useState(false);
  const [openEvent, setOpenEvent] = useState<DrawerEvent | null>(null);
  const [showWrap, setShowWrap] = useState(false);

  const p = MX_PALETTES[paletteId] ?? MX_PALETTES.tomato;
  const allContributions = contributions ?? [];

  useEffect(() => {
    let cancelled = false;
    isSeeded().then((seeded) => {
      if (cancelled) return;
      if (!seeded && (!contributions || contributions.length === 0)) setShowFirstRun(true);
      setSeedChecked(true);
    });
    return () => { cancelled = true; };
  }, [contributions]);

  const seedMutation = useMutation({
    mutationFn: async () => seedFromBundledDemo(),
    onSuccess: () => setShowFirstRun(false),
  });

  const startFresh = useMutation({
    mutationFn: async () => markSeeded(),
    onSuccess: () => setShowFirstRun(false),
  });

  const recentEvents = [...allContributions]
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
    .slice(0, 5);

  function handleOpenEvent(contribution: Contribution) {
    const kind = sourceToKind(contribution.source);
    const color = categoryColor(contribution.category, p);
    const d = new Date(contribution.occurredAt);
    const dateStr = String(d.getDate()).padStart(2, '0') + ' ' + MONTH_LABELS[d.getMonth()];
    setOpenEvent({
      id: contribution.id,
      m: dateStr,
      kind,
      title: contribution.signal,
      tag: contribution.category,
      color,
      detail: {
        source: contribution.source,
        refs: contribution.externalId ? [contribution.externalId] : [],
        body: contribution.signal,
        weight: Math.min(contribution.weight / 5, 1),
      },
    });
  }

  function handleWrap(_mode: 'phone' | 'desktop') {
    setShowWrap(true);
  }

  return (
    <div style={{ background: p.paper, minHeight: '100vh', fontFamily: 'Space Grotesk, sans-serif' }}>
      {/* Top Nav */}
      <nav style={{ background: p.cream, borderBottom: '2px solid ' + p.ink, display: 'flex', alignItems: 'center', padding: '0 24px', height: 56 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginRight: 32 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: p.hot, border: '2px solid ' + p.ink, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>
            &#127806;
          </div>
          <span style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: 16, color: p.ink }}>burrito.</span>
        </div>
        <div style={{ display: 'flex', gap: 0, marginRight: 'auto' }}>
          {(['timeline', 'archive', 'settings'] as const).map((tab) => (
            <button key={tab} type="button" style={{ background: 'none', border: 'none', borderBottom: tab === 'timeline' ? '2px solid ' + p.hot : '2px solid transparent', padding: '0 16px', height: 54, fontFamily: 'Space Grotesk, sans-serif', fontSize: 13, fontWeight: tab === 'timeline' ? 700 : 500, color: tab === 'timeline' ? p.hot : p.ink, cursor: 'pointer', opacity: tab === 'timeline' ? 1 : 0.55, letterSpacing: '0.02em' }}>
              {tab}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <PaletteSwitcher p={p} onSelect={setPaletteId} />
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: p.accent, border: '2px solid ' + p.ink, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, fontWeight: 700, color: p.cream, flexShrink: 0 }}>
            YO
          </div>
        </div>
      </nav>

      {/* Main content */}
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '32px 24px', display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 28, alignItems: 'start' }}>
        {/* Left column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, fontWeight: 700, color: p.accent, letterSpacing: '0.12em' }}>
            &#9675; 2026 · MAY · IN PROGRESS
          </span>

          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 110, fontWeight: 700, color: p.ink, lineHeight: 0.9, letterSpacing: '-0.04em' }}>
              {allContributions.length}
            </span>
            <p style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 20, color: p.ink, fontWeight: 500, lineHeight: 1.35, maxWidth: 260, margin: 0 }}>
              contributions caught<br />this year, automatically.
            </p>
          </div>

          <YearRhythmCard contributions={allContributions} p={p} />

          {showFirstRun && seedChecked && (
            <FirstRunPanel
              seedMutation={{ isPending: seedMutation.isPending, isError: seedMutation.isError, error: seedMutation.error instanceof Error ? seedMutation.error : null, mutate: () => seedMutation.mutate() }}
              startFresh={{ isPending: startFresh.isPending, mutate: () => startFresh.mutate() }}
              p={p}
            />
          )}

          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, fontWeight: 700, color: p.ink, letterSpacing: '0.12em' }}>RECENT</span>
              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: p.ink, opacity: 0.45 }}>tap any to expand &#8594;</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {recentEvents.length > 0 ? (
                recentEvents.map((c) => <EventRow key={c.id} contribution={c} p={p} onOpen={handleOpenEvent} />)
              ) : (
                <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: p.ink, opacity: 0.4, padding: '16px 0', margin: 0 }}>No contributions yet - load demo data or add one manually.</p>
              )}
            </div>
          </div>

          <ContributionFeed contributions={allContributions} p={p} onOpen={handleOpenEvent} />
        </div>

        {/* Right column (sidebar) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, position: 'sticky', top: 24, alignSelf: 'start' }}>
          <WrapCtaCard p={p} onWrap={handleWrap} />
          <CategoryBreakdownCard p={p} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <StatBox bg={p.lime} textColor={p.ink} label="UNBLOCKS" value="12" sub="teammates" p={p} />
            <StatBox bg={p.accent} textColor={p.cream} label="SHIPS" value="4" sub="this year" p={p} />
          </div>
          <div>
            <button
              type="button"
              onClick={() => setShowManualInput((v) => !v)}
              style={{ width: '100%', background: p.paper, border: '2px solid ' + p.ink, borderRadius: 12, padding: '10px 16px', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, fontWeight: 700, color: p.ink, cursor: 'pointer', letterSpacing: '0.1em', textAlign: 'left', boxShadow: '3px 3px 0 ' + p.ink }}
            >
              {showManualInput ? '&#9650; HIDE MANUAL INPUT' : '&#9660; ADD CONTRIBUTION MANUALLY'}
            </button>
            {showManualInput && (
              <div style={{ marginTop: 12 }}><ManualInputForm /></div>
            )}
          </div>
          <GenerateWrapModal open={showWrap} onOpenChange={setShowWrap} />
          <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: p.ink, opacity: 0.4, lineHeight: 1.6, paddingTop: 4, margin: 0 }}>
            a mirror, not a judge. burrito drafts. you edit. you own it.
          </p>
        </div>
      </div>

      <EventDetailDrawer p={p} event={openEvent} onClose={() => setOpenEvent(null)} />
    </div>
  );
}
