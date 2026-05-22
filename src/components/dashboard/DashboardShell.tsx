'use client';

/*
 * Design philosophy: Maximalist editorial — bold borders, hard shadows, cream backgrounds.
 * File role: Compose the full dashboard shell with nav, hero, year-rhythm chart, events,
 *   sidebar CTA, category breakdown, and stat boxes.
 * Guardrail: All colour values are derived from the active MxPalette so switching palettes
 *   repaints the entire dashboard without hunting for inline hex values.
 */
import { useMutation } from '@tanstack/react-query';
import { useLiveQuery } from 'dexie-react-hooks';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AddProviderForm } from '@/components/settings/AddProviderForm';
import { SyncControls } from '@/components/settings/SyncControls';
import { ContributionFeed } from '@/components/dashboard/ContributionFeed';
import { EventDetailDrawer } from '@/components/dashboard/EventDetailDrawer';
import type { DrawerEvent } from '@/components/dashboard/EventDetailDrawer';
import { GenerateWrapModal } from '@/components/dashboard/GenerateWrapModal';
import { ImportFromFileModal } from '@/components/dashboard/ImportFromFileModal';
import { ManualInputForm } from '@/components/dashboard/ManualInputForm';
import { PendingImportsList } from '@/components/dashboard/PendingImportsList';
import { ResetModal } from '@/components/dashboard/ResetModal';
import { useContributions } from '@/components/dashboard/useContributions';
import { hasActiveKey } from '@/lib/local-store/crypto';
import { clearSessionId, db, META_KEYS } from '@/lib/local-store/db';
import { listIdentities, type StoredIdentity } from '@/lib/local-store/identities';
import { isSeeded, markSeeded, seedFromBundledDemo } from '@/lib/local-store/seed';
import { listWraps } from '@/lib/local-store/wraps';
import { PROVIDERS_CONFIG } from '@/lib/providers/config';
import type { Contribution, ContributionCategory } from '@/lib/types';
import type { StoredWrap } from '@/lib/local-store/wraps';
// Registers GitLab provider in the in-memory registry before AddProviderForm reads it.
import '@/lib/providers';

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

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return isMobile;
}

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
      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, fontWeight: 700, color: needsDarkText ? p.ink : '#fff', background: color, borderRadius: 4, padding: '2px 8px', letterSpacing: '0.1em', flexShrink: 0, border: '1.5px solid ' + p.ink, textTransform: 'uppercase' }}>{contribution.category}</span>
      <span style={{ flex: 1, fontSize: 13, color: p.ink, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{contribution.signal}</span>
      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: p.ink, opacity: 0.55, flexShrink: 0, letterSpacing: '0.08em' }}>{kind}</span>
      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: p.ink, opacity: 0.35, flexShrink: 0 }}>&#8594;</span>
    </div>
  );
}

function WrapCtaCard({ p, onWrap }: { p: MxPalette; onWrap?: () => void }) {
  return (
    <div style={{ background: p.hot, border: '2px solid ' + p.ink, borderRadius: 16, boxShadow: '4px 4px 0 ' + p.ink, padding: '24px 24px 20px' }}>
      <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, fontWeight: 700, color: p.cream, letterSpacing: '0.14em', opacity: 0.8, marginBottom: 8, margin: '0 0 8px' }}>READY ENOUGH</p>
      <h2 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 32, fontWeight: 700, color: p.cream, lineHeight: 1.1, margin: '0 0 10px' }}>wrap your year so far.</h2>
      <p style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 14, color: p.cream, opacity: 0.85, margin: '0 0 20px', lineHeight: 1.5 }}>7 highlight slides. ready in 60 seconds...</p>
      <button type="button" onClick={() => onWrap?.()} style={{ width: '100%', background: p.lime, border: '2px solid ' + p.ink, borderRadius: 10, boxShadow: '3px 3px 0 ' + p.ink, padding: '12px 20px', fontFamily: 'Space Grotesk, sans-serif', fontSize: 15, fontWeight: 700, color: p.ink, cursor: 'pointer', letterSpacing: '0.02em' }}>
        WRAP IT &#127791;
      </button>
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
// Wrapped tab
// ---------------------------------------------------------------------------

type WrapSummary = Pick<StoredWrap, 'id' | 'mode' | 'windowStart' | 'windowEnd' | 'createdAt'>;

function WrappedTab({ p, onGenerate }: { p: MxPalette; onGenerate: () => void }) {
  const [wraps, setWraps] = useState<WrapSummary[] | null>(null);

  useEffect(() => {
    listWraps().then(setWraps);
  }, []);

  const fmt = (d: Date) =>
    d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '32px 24px' }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, fontWeight: 700, color: p.accent, letterSpacing: '0.12em' }}>
            &#9675; YOUR WRAPS
          </span>
          <h1 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 36, fontWeight: 700, color: p.ink, lineHeight: 1.1, margin: '6px 0 0' }}>
            Wrapped.
          </h1>
        </div>
        <button
          type="button"
          onClick={onGenerate}
          style={{
            background: p.hot, border: '2px solid ' + p.ink, borderRadius: 12,
            boxShadow: '4px 4px 0 ' + p.ink, padding: '12px 24px',
            fontFamily: 'Space Grotesk, sans-serif', fontSize: 15, fontWeight: 700,
            color: p.cream, cursor: 'pointer', letterSpacing: '0.02em',
          }}
        >
          + Generate wrap &#127791;
        </button>
      </div>

      {/* Wrap list */}
      {wraps === null ? (
        <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: p.ink, opacity: 0.45 }}>Loading…</p>
      ) : wraps.length === 0 ? (
        <div style={{
          background: p.cream, border: '2px solid ' + p.ink, borderRadius: 16,
          boxShadow: '4px 4px 0 ' + p.ink, padding: '48px 32px', textAlign: 'center',
        }}>
          <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: p.ink, opacity: 0.5, letterSpacing: '0.12em', marginBottom: 12, margin: '0 0 12px' }}>
            NO WRAPS YET
          </p>
          <p style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 18, color: p.ink, fontWeight: 600, margin: '0 0 20px' }}>
            Generate your first wrap to see it here.
          </p>
          <button
            type="button"
            onClick={onGenerate}
            style={{
              background: p.lime, border: '2px solid ' + p.ink, borderRadius: 10,
              boxShadow: '3px 3px 0 ' + p.ink, padding: '12px 28px',
              fontFamily: 'Space Grotesk, sans-serif', fontSize: 14, fontWeight: 700,
              color: p.ink, cursor: 'pointer',
            }}
          >
            WRAP IT &#127791;
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 18 }}>
          {wraps.map((wrap) => (
            <Link
              key={wrap.id}
              href={`/wrap?id=${wrap.id}`}
              style={{ textDecoration: 'none', display: 'block' }}
            >
              <div style={{
                background: p.cream, border: '2px solid ' + p.ink, borderRadius: 14,
                boxShadow: '4px 4px 0 ' + p.ink, padding: '20px 22px', cursor: 'pointer',
                transition: 'transform 0.1s ease, box-shadow 0.1s ease',
              }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.transform = 'translate(-2px,-2px)'; (e.currentTarget as HTMLDivElement).style.boxShadow = '6px 6px 0 ' + p.ink; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.transform = ''; (e.currentTarget as HTMLDivElement).style.boxShadow = '4px 4px 0 ' + p.ink; }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <span style={{
                    fontFamily: 'JetBrains Mono, monospace', fontSize: 10, fontWeight: 700,
                    color: wrap.mode === 'year-end' ? p.cream : p.ink,
                    background: wrap.mode === 'year-end' ? p.hot : p.lime,
                    border: '1.5px solid ' + p.ink, borderRadius: 4,
                    padding: '2px 8px', letterSpacing: '0.1em',
                  }}>
                    {wrap.mode === 'year-end' ? 'YEAR-END' : 'SNAPSHOT'}
                  </span>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: p.ink, opacity: 0.45 }}>
                    {fmt(wrap.createdAt)}
                  </span>
                </div>
                <p style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 15, fontWeight: 600, color: p.ink, margin: '0 0 6px' }}>
                  {fmt(wrap.windowStart)} → {fmt(wrap.windowEnd)}
                </p>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: p.ink, opacity: 0.5 }}>
                  view wrap &#8594;
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Settings tab
// ---------------------------------------------------------------------------

type IdentityWithSync = StoredIdentity & {
  lastSyncAt: number | null;
  lastError: string | null;
};

async function loadIdentitiesWithSync(): Promise<IdentityWithSync[]> {
  if (!hasActiveKey()) return [];
  const identities = await listIdentities();
  const states = await db().syncState.toArray();
  const byIdentity = new Map(states.map((s) => [s.identityId, s]));
  return identities.map((i) => {
    const s = byIdentity.get(i.id);
    return {
      ...i,
      lastSyncAt: s?.lastSyncAt ?? null,
      lastError: s?.lastError ?? null,
    };
  });
}

function formatRelative(ts: number | null): string {
  if (!ts) return 'never';
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

const PROVIDER_META: Record<string, { glyph: string; sub: string }> = {
  'gitlab-dedicated': { glyph: '◈', sub: 'MRs · reviews · commits' },
};

function providerColor(providerId: string, p: MxPalette): string {
  const map: Record<string, string> = {
    'gitlab-dedicated': p.lime,
  };
  return map[providerId] ?? p.accent;
}

function LeavePreviewSection({ p }: { p: MxPalette }) {
  const [busy, setBusy] = useState(false);

  const handleLeave = useCallback(async () => {
    setBusy(true);
    // Delete meta keys from the current per-session DB while it is still active.
    await db().meta.delete(META_KEYS.inviteValidated);
    await db().meta.delete(META_KEYS.wrapInstallToken);
    // Clear the session — db() will now point to the default DB on next open.
    clearSessionId();
    window.location.reload();
  }, []);

  return (
    <div style={{ background: '#fff', border: '2px solid ' + p.ink, borderRadius: 16, boxShadow: '4px 4px 0 ' + p.ink, padding: '22px 26px' }}>
      <p style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, fontWeight: 700, color: p.ink, letterSpacing: '0.14em', opacity: 0.6, margin: '0 0 6px' }}>PREVIEW</p>
      <h2 style={{ fontFamily: '"Space Grotesk", system-ui, sans-serif', fontSize: 18, fontWeight: 700, color: p.ink, margin: '0 0 8px' }}>Leave preview</h2>
      <p style={{ fontFamily: '"Space Grotesk", system-ui, sans-serif', fontSize: 13, color: p.ink, opacity: 0.65, margin: '0 0 14px', lineHeight: 1.5 }}>
        Clear your invite session. You will need a valid invite code to re-enter.
      </p>
      <button
        type="button"
        onClick={handleLeave}
        disabled={busy}
        style={{
          background: 'transparent', border: '2px solid ' + p.ink, borderRadius: 10,
          padding: '9px 20px', fontFamily: '"Space Grotesk", system-ui, sans-serif', fontSize: 13, fontWeight: 700,
          color: p.ink, cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.5 : 1,
        }}
      >
        {busy ? 'Leaving…' : 'Leave preview'}
      </button>
    </div>
  );
}

function SettingsTab({
  p,
  profileName,
  onSaveName,
  onResetSuccess,
}: {
  p: MxPalette;
  profileName: string;
  onSaveName: (name: string) => void;
  onResetSuccess?: () => void;
}) {
  const [draft, setDraft] = useState(profileName);
  const [saved, setSaved] = useState(false);
  const [expandedProviderId, setExpandedProviderId] = useState<string | null>(null);
  const [connectingProviderId, setConnectingProviderId] = useState<string | null>(null);
  const [showReset, setShowReset] = useState(false);
  const identities = useLiveQuery(loadIdentitiesWithSync, [], [] as IdentityWithSync[]);

  useEffect(() => { setDraft(profileName); }, [profileName]);

  useEffect(() => {
    if (!connectingProviderId) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setConnectingProviderId(null); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [connectingProviderId]);

  function handleSave() {
    onSaveName(draft.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const byProvider = useMemo(() => {
    const m = new Map<string, IdentityWithSync[]>();
    (identities ?? []).forEach((i) => {
      const arr = m.get(i.providerId) ?? [];
      arr.push(i);
      m.set(i.providerId, arr);
    });
    return m;
  }, [identities]);

  const totalProviders = PROVIDERS_CONFIG.providers.length;
  const connectedCount = Array.from(byProvider.values()).filter((arr) => arr.length > 0).length;

  const mxMono = '"JetBrains Mono", ui-monospace, monospace';
  const mxFont = '"Space Grotesk", system-ui, sans-serif';

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: 28 }}>
      {/* Header */}
      <div>
        <span style={{ fontFamily: mxMono, fontSize: 11, fontWeight: 700, color: p.accent, letterSpacing: '0.18em' }}>
          &#9675; SETTINGS · CONTRIBUTION TOOLS
        </span>
        <h1 style={{ fontFamily: mxFont, fontSize: 'clamp(2.2rem, 5vw, 3rem)', fontWeight: 800, color: p.ink, lineHeight: 1, letterSpacing: '-0.03em', margin: '10px 0 8px' }}>
          connect your{' '}
          <span style={{
            background: p.hot, color: p.cream,
            padding: '0 12px', display: 'inline-block',
            transform: 'rotate(-1.5deg)', borderRadius: 6,
          }}>tools</span>.
        </h1>
        <p style={{ fontFamily: mxFont, fontSize: 14, color: p.ink, opacity: 0.65, margin: 0 }}>
          we watch the work you&apos;ve already done. nothing manual.
        </p>
      </div>

      {/* Profile card */}
      <div style={{ background: p.cream, border: '2px solid ' + p.ink, borderRadius: 16, boxShadow: '4px 4px 0 ' + p.ink, padding: '22px 26px' }}>
        <p style={{ fontFamily: mxMono, fontSize: 10, fontWeight: 700, color: p.ink, letterSpacing: '0.14em', opacity: 0.6, margin: '0 0 6px' }}>PROFILE</p>
        <h2 style={{ fontFamily: mxFont, fontSize: 22, fontWeight: 700, color: p.ink, margin: '0 0 16px' }}>Who are you?</h2>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <label style={{ display: 'block', fontFamily: mxMono, fontSize: 10, letterSpacing: '0.1em', color: p.ink, opacity: 0.7, marginBottom: 6 }}>
              YOUR NAME
            </label>
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              placeholder="e.g. Alex Chen"
              style={{
                width: '100%', boxSizing: 'border-box',
                fontFamily: mxFont, fontSize: 16, fontWeight: 600,
                background: '#fff', border: '2px solid ' + p.ink, borderRadius: 10,
                padding: '10px 14px', color: p.ink, outline: 'none',
              }}
            />
          </div>
          <button
            type="button"
            onClick={handleSave}
            style={{
              background: saved ? p.lime : p.hot,
              border: '2px solid ' + p.ink, borderRadius: 10,
              boxShadow: '3px 3px 0 ' + p.ink, padding: '10px 22px',
              fontFamily: mxFont, fontSize: 14, fontWeight: 700,
              color: saved ? p.ink : p.cream, cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            {saved ? 'Saved ✓' : 'Save name'}
          </button>
        </div>
        <p style={{ fontFamily: mxMono, fontSize: 10, color: p.ink, opacity: 0.45, margin: '10px 0 0' }}>
          Stored locally on this device only. Drives the dashboard greeting.
        </p>
      </div>

      {/* Provider grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
        {PROVIDERS_CONFIG.providers.map((config) => {
          const ids = byProvider.get(config.id) ?? [];
          const isConnected = ids.length > 0;
          const meta = PROVIDER_META[config.id] ?? { glyph: '◆', sub: 'contributions' };
          const tone = providerColor(config.id, p);
          const isExpanded = expandedProviderId === config.id;

          return (
            <div key={config.id}>
              <div
                role="button"
                tabIndex={0}
                onClick={() => {
                  if (isConnected) setExpandedProviderId(isExpanded ? null : config.id);
                  else setConnectingProviderId(config.id);
                }}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter' && e.key !== ' ') return;
                  e.preventDefault();
                  if (isConnected) setExpandedProviderId(isExpanded ? null : config.id);
                  else setConnectingProviderId(config.id);
                }}
                style={{
                  border: '2px solid ' + p.ink, borderRadius: 12, padding: '12px 14px',
                  background: isConnected ? tone : '#fff',
                  display: 'flex', alignItems: 'center', gap: 10,
                  cursor: 'pointer', boxShadow: '3px 3px 0 ' + p.ink,
                  transition: 'background 0.15s',
                }}
              >
                <div style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: isConnected ? '#fff' : tone,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 16, fontWeight: 800, border: '2px solid ' + p.ink, flexShrink: 0,
                }}>{meta.glyph}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: mxFont, fontWeight: 700, fontSize: 14, color: p.ink }}>{config.label}</div>
                  <div style={{ fontFamily: mxMono, fontSize: 10, color: isConnected ? p.ink : '#666' }}>
                    {isConnected
                      ? `● connected · ${ids.length} account${ids.length !== 1 ? 's' : ''}`
                      : meta.sub}
                  </div>
                </div>
                <div style={{
                  fontFamily: mxMono, fontSize: 11, fontWeight: 800,
                  padding: '4px 10px', borderRadius: 999,
                  background: isConnected ? p.ink : 'transparent',
                  color: isConnected ? p.cream : p.ink,
                  border: '1.5px solid ' + p.ink, whiteSpace: 'nowrap',
                }}>{isConnected ? 'ON' : '+ LINK'}</div>
              </div>

              {isExpanded && isConnected && (
                <div style={{
                  marginTop: 8, background: p.cream, border: '2px solid ' + p.ink,
                  borderRadius: 12, boxShadow: '3px 3px 0 ' + p.ink, padding: '14px 16px',
                  display: 'flex', flexDirection: 'column', gap: 12,
                }}>
                  {ids.map((identity) => (
                    <div key={identity.id} style={{ background: '#fff', border: '2px solid ' + p.ink, borderRadius: 10, padding: '12px 14px' }}>
                      <div style={{ fontFamily: mxFont, fontSize: 14, fontWeight: 700, color: p.ink }}>
                        {identity.displayName ?? identity.username ?? identity.externalUserId}
                      </div>
                      <div style={{ fontFamily: mxMono, fontSize: 10, color: p.ink, opacity: 0.55, margin: '2px 0 4px' }}>
                        {identity.instanceUrl}
                      </div>
                      <div style={{ fontFamily: mxMono, fontSize: 10, color: p.ink, opacity: 0.55, marginBottom: 10 }}>
                        last sync: {formatRelative(identity.lastSyncAt)}
                        {identity.lastError ? ' · ' : ''}
                        {identity.lastError ? <span style={{ color: p.hot }}>{identity.lastError}</span> : null}
                      </div>
                      <SyncControls identityId={identity.id} />
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setConnectingProviderId(config.id)}
                    style={{
                      alignSelf: 'flex-start', background: p.paper, border: '2px solid ' + p.ink,
                      borderRadius: 10, padding: '8px 16px', fontFamily: mxMono, fontSize: 11,
                      fontWeight: 700, color: p.ink, cursor: 'pointer', letterSpacing: '0.08em',
                    }}
                  >
                    + ADD ANOTHER ACCOUNT
                  </button>
                </div>
              )}
            </div>
          );
        })}

      </div>

      {/* Privacy banner */}
      <div style={{
        padding: '12px 16px', borderRadius: 10,
        background: p.lime, border: '2px solid ' + p.ink,
        fontFamily: mxMono, fontSize: 11, lineHeight: 1.5, color: p.ink,
      }}>
        🔒 your data stays yours. wraps are private until you share a link.
      </div>

      {/* Status footer */}
      <p style={{ fontFamily: mxMono, fontSize: 10, color: p.ink, opacity: 0.55, letterSpacing: '0.08em', margin: 0, textAlign: 'center' }}>
        {connectedCount} / {totalProviders} provider{totalProviders !== 1 ? 's' : ''} connected
      </p>

      {/* Leave preview section */}
      <LeavePreviewSection p={p} />

      {/* Reset section */}
      <div style={{ background: '#fff', border: '2px solid ' + p.ink, borderRadius: 16, boxShadow: '4px 4px 0 ' + p.ink, padding: '22px 26px' }}>
        <p style={{ fontFamily: mxMono, fontSize: 10, fontWeight: 700, color: '#FF4D2E', letterSpacing: '0.14em', opacity: 0.85, margin: '0 0 6px' }}>DANGER ZONE</p>
        <h2 style={{ fontFamily: mxFont, fontSize: 18, fontWeight: 700, color: p.ink, margin: '0 0 8px' }}>Reset this device</h2>
        <p style={{ fontFamily: mxFont, fontSize: 13, color: p.ink, opacity: 0.65, margin: '0 0 14px', lineHeight: 1.5 }}>
          Clear contributions and wraps, or remove the passphrase and start fresh.
        </p>
        <button
          type="button"
          onClick={() => setShowReset(true)}
          style={{
            background: 'transparent', border: '2px solid #FF4D2E', borderRadius: 10,
            padding: '9px 20px', fontFamily: mxFont, fontSize: 13, fontWeight: 700,
            color: '#FF4D2E', cursor: 'pointer',
          }}
        >
          Reset this device…
        </button>
      </div>

      {showReset && (
        <ResetModal
          open={showReset}
          onClose={() => setShowReset(false)}
          onSuccess={onResetSuccess}
        />
      )}

      {/* Connect modal */}
      {connectingProviderId && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(10,10,10,0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16,
          }}
          onClick={() => setConnectingProviderId(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 520, maxHeight: '90vh', overflow: 'auto', position: 'relative' }}
          >
            <button
              type="button"
              onClick={() => setConnectingProviderId(null)}
              aria-label="Close"
              style={{
                position: 'absolute', top: 12, right: 16, zIndex: 1,
                background: 'transparent', border: 'none', fontSize: 22,
                cursor: 'pointer', color: p.ink, lineHeight: 1, padding: 4,
              }}
            >✕</button>
            <AddProviderForm
              providerId={connectingProviderId}
              onConnected={() => {
                setExpandedProviderId(connectingProviderId);
                setConnectingProviderId(null);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main shell
// ---------------------------------------------------------------------------

const DEFAULT_MX_PALETTE = {
  id: 'tomato', label: 'Tomato', sub: 'default', swatch: ['#FF4D2E', '#C6FF3B', '#0A0A0A', '#6B3DFF', '#7BE3FF'],
  hot: '#FF4D2E', lime: '#C6FF3B', ink: '#0A0A0A', cream: '#FFF4DE', paper: '#FBF5E5',
  accent: '#6B3DFF', accent2: '#7BE3FF', accent3: '#FFB3C7',
};

export function DashboardShell() {
  const isMobile = useIsMobile();
  const { data: contributions } = useContributions();
  const [paletteId, setPaletteId] = useState<string>('tomato');
  const [activeTab, setActiveTab] = useState<'timeline' | 'settings' | 'wrapped'>('timeline');
  const [seedChecked, setSeedChecked] = useState(false);
  const [showFirstRun, setShowFirstRun] = useState(false);
  const [showManualInput, setShowManualInput] = useState(false);
  const [showFileImport, setShowFileImport] = useState(false);
  const [openEvent, setOpenEvent] = useState<DrawerEvent | null>(null);
  const [showWrap, setShowWrap] = useState(false);
  const [profileName, setProfileName] = useState('');

  useEffect(() => {
    const raw = localStorage.getItem('burrito:profile');
    if (raw) {
      try { setProfileName(JSON.parse(raw).name ?? ''); } catch { /* ignore */ }
    }
  }, []);

  function saveProfileName(name: string) {
    setProfileName(name);
    localStorage.setItem('burrito:profile', JSON.stringify({ name }));
  }

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

  function handleWrap() {
    setShowWrap(true);
  }

  return (
    <div style={{ background: p.paper, minHeight: '100vh', fontFamily: 'Space Grotesk, sans-serif' }}>
      {/* Top Nav */}
      <nav style={{ background: p.cream, borderBottom: '2px solid ' + p.ink, display: 'flex', alignItems: 'center', padding: isMobile ? '0 12px' : '0 24px', height: 56, gap: isMobile ? 8 : 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginRight: isMobile ? 0 : 32, flexShrink: 0 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: p.hot, border: '2px solid ' + p.ink, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>
            &#127791;
          </div>
          {!isMobile && (
            <span style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: 16, color: p.ink }}>burrito.</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 0, marginRight: 'auto', overflowX: 'auto' }}>
          {(['timeline', 'settings', 'wrapped'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              style={{
                background: 'none', border: 'none',
                borderBottom: activeTab === tab ? '2px solid ' + p.hot : '2px solid transparent',
                padding: isMobile ? '0 10px' : '0 16px', height: 54,
                fontFamily: 'Space Grotesk, sans-serif', fontSize: 13,
                fontWeight: activeTab === tab ? 700 : 500,
                color: activeTab === tab ? p.hot : p.ink,
                cursor: 'pointer', opacity: activeTab === tab ? 1 : 0.55, letterSpacing: '0.02em',
                whiteSpace: 'nowrap',
              }}
            >
              {tab}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 12, flexShrink: 0 }}>
          <PaletteSwitcher p={p} onSelect={setPaletteId} />
          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            title="Edit profile & settings"
            style={{ width: 32, height: 32, borderRadius: '50%', background: p.accent, border: '2px solid ' + p.ink, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, fontWeight: 700, color: p.cream, flexShrink: 0, cursor: 'pointer', padding: 0 }}
          >
            {profileName
              ? profileName.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
              : 'YO'}
          </button>
        </div>
      </nav>

      {/* Wrapped tab */}
      {activeTab === 'wrapped' && (
        <WrappedTab p={p} onGenerate={() => setShowWrap(true)} />
      )}

      {/* Settings tab */}
      {activeTab === 'settings' && (
        <SettingsTab
          p={p}
          profileName={profileName}
          onSaveName={saveProfileName}
          onResetSuccess={() => setActiveTab('timeline')}
        />
      )}

      {/* Main content (timeline tab) */}
      {activeTab === 'timeline' && <div style={{ maxWidth: 1280, margin: '0 auto', padding: isMobile ? '20px 16px' : '32px 24px', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.4fr 1fr', gap: isMobile ? 20 : 28, alignItems: 'start' }}>
        {/* Left column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? 18 : 24, minWidth: 0 }}>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, fontWeight: 700, color: p.accent, letterSpacing: '0.12em' }}>
            &#9675; 2026 · MAY · IN PROGRESS
          </span>

          {profileName && (
            <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: p.ink, opacity: 0.65, margin: 0, letterSpacing: '0.06em' }}>
              hey, {profileName.split(' ')[0].toLowerCase()} —
            </p>
          )}

          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: isMobile ? 72 : 110, fontWeight: 700, color: p.ink, lineHeight: 0.9, letterSpacing: '-0.04em' }}>
              {allContributions.length}
            </span>
            <p style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: isMobile ? 16 : 20, color: p.ink, fontWeight: 500, lineHeight: 1.35, maxWidth: 260, margin: 0 }}>
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, position: isMobile ? 'static' : 'sticky', top: 24, alignSelf: 'start', minWidth: 0 }}>
          <WrapCtaCard p={p} onWrap={handleWrap} />
          <CategoryBreakdownCard p={p} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={() => setShowManualInput(true)}
                style={{ flex: 1, background: p.paper, border: '2px solid ' + p.ink, borderRadius: 12, padding: '10px 14px', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, fontWeight: 700, color: p.ink, cursor: 'pointer', letterSpacing: '0.1em', textAlign: 'left', boxShadow: '3px 3px 0 ' + p.ink }}
              >
                + ADD MANUALLY
              </button>
              <button
                type="button"
                onClick={() => setShowFileImport(true)}
                aria-label="Import from file"
                style={{ flex: 1, background: p.paper, border: '2px solid ' + p.ink, borderRadius: 12, padding: '10px 14px', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, fontWeight: 700, color: p.ink, cursor: 'pointer', letterSpacing: '0.1em', textAlign: 'left', boxShadow: '3px 3px 0 ' + p.ink }}
              >
                + IMPORT FROM FILE
              </button>
            </div>
            <PendingImportsList p={p} />
          </div>
          <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: p.ink, opacity: 0.4, lineHeight: 1.6, paddingTop: 4, margin: 0 }}>
            a mirror, not a judge. burrito drafts. you edit. you own it.
          </p>
        </div>
      </div>}

      <ManualInputForm open={showManualInput} onClose={() => setShowManualInput(false)} />
      <ImportFromFileModal open={showFileImport} onClose={() => setShowFileImport(false)} />
      <GenerateWrapModal open={showWrap} onOpenChange={setShowWrap} />
      <EventDetailDrawer p={p} event={openEvent} onClose={() => setOpenEvent(null)} />
    </div>
  );
}

