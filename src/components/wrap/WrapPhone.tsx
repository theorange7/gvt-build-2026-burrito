'use client';
import { useCallback, useEffect, useState } from 'react';
import type { SliceContent, WrapMode } from '@/lib/types';
import { CollaborationStyle } from '@/components/slides/CollaborationStyle';
import { Consistency } from '@/components/slides/Consistency';
import { CrossTeamImpact } from '@/components/slides/CrossTeamImpact';
import { DeepWorkStreak } from '@/components/slides/DeepWorkStreak';
import { HighlightReel } from '@/components/slides/HighlightReel';
import { Identity } from '@/components/slides/Identity';
import { Initiative } from '@/components/slides/Initiative';
import { LaunchesShipped } from '@/components/slides/LaunchesShipped';
import { Mentorship } from '@/components/slides/Mentorship';
import { Velocity } from '@/components/slides/Velocity';

interface MxPalette {
  hot: string; lime: string; ink: string; cream: string; paper: string;
  accent: string; accent2: string; accent3: string; [key: string]: unknown;
}

interface WrapPhoneProps {
  p: MxPalette;
  onClose: () => void;
  slices: SliceContent[];
  mode: WrapMode;
}

type SlideComponent = React.ComponentType<{ content: SliceContent; mode: WrapMode; index: number }>;

const SLICE_MAP: Record<string, SlideComponent> = {
  launches_shipped: LaunchesShipped,
  velocity: Velocity,
  cross_team_impact: CrossTeamImpact,
  deep_work_streak: DeepWorkStreak,
  mentorship: Mentorship,
  initiative: Initiative,
  collaboration_style: CollaborationStyle,
  consistency: Consistency,
  highlight_reel: HighlightReel,
  identity: Identity,
};

const SLIDE_DURATION_S = 6;

// SlideFrame renders at 390×844. The phone inner area is 340×700 (360 - 2×10 padding).
// Scale to fit: min(340/390, 700/844) ≈ 0.829 — use height as the binding constraint.
const PHONE_INNER_W = 340;
const PHONE_INNER_H = 700;
const FRAME_W = 390;
const FRAME_H = 844;
const SLIDE_SCALE = Math.min(PHONE_INNER_W / FRAME_W, PHONE_INNER_H / FRAME_H);

export function WrapPhone({ p, onClose, slices, mode }: WrapPhoneProps) {
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [progress, setProgress] = useState(0);
  const total = slices.length;

  const next = useCallback(() => setIdx(i => Math.min(total - 1, i + 1)), [total]);
  const prev = useCallback(() => setIdx(i => Math.max(0, i - 1)), []);

  useEffect(() => { setProgress(0); }, [idx]);

  // Auto-advance with smooth progress bar
  useEffect(() => {
    if (!playing) return;
    const start = Date.now();
    const id = setInterval(() => {
      const t = (Date.now() - start) / (SLIDE_DURATION_S * 1000);
      if (t >= 1) {
        clearInterval(id);
        if (idx < total - 1) setIdx(idx + 1);
        else setPlaying(false);
      } else {
        setProgress(t);
      }
    }, 50);
    return () => clearInterval(id);
  }, [idx, playing, total]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') prev();
      else if (e.key === ' ') { e.preventDefault(); setPlaying(v => !v); }
      else if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [next, prev, onClose]);

  const mxMono = '"JetBrains Mono", ui-monospace, monospace';
  const mxFont = '"Space Grotesk", system-ui, sans-serif';

  const slice = slices[idx];
  const Component = slice ? SLICE_MAP[slice.sliceKey] : null;

  const navBtnBase: React.CSSProperties = {
    width: 48, height: 48, borderRadius: '50%', border: `2px solid ${p.ink}`,
    fontSize: 22, fontWeight: 800, cursor: 'pointer', fontFamily: mxFont,
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, gap: 28 }}>
      {/* prev */}
      <button onClick={prev} disabled={idx === 0} style={{ ...navBtnBase, background: idx === 0 ? '#333' : p.cream, color: idx === 0 ? '#666' : p.ink, cursor: idx === 0 ? 'default' : 'pointer' }}>←</button>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
        {/* progress segments */}
        <div style={{ display: 'flex', gap: 4, width: 320 }}>
          {Array.from({ length: total }).map((_, i) => (
            <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, overflow: 'hidden', background: 'rgba(255,255,255,0.25)' }}>
              <div style={{
                width: i < idx ? '100%' : i === idx ? `${progress * 100}%` : '0%',
                height: '100%', background: p.hot,
                transition: i === idx ? 'none' : 'width 0.2s',
              }} />
            </div>
          ))}
        </div>

        {/* phone frame */}
        <div
          onClick={next}
          style={{
            width: 360, height: 720, borderRadius: 44, padding: 10,
            background: p.ink, boxShadow: '0 30px 80px rgba(0,0,0,0.5)',
            cursor: 'pointer', position: 'relative',
          }}
        >
          <div style={{ width: '100%', height: '100%', borderRadius: 36, overflow: 'hidden', position: 'relative', background: '#000', display: 'flex', alignItems: 'flex-start', justifyContent: 'center' }}>
            {Component ? (
              <div style={{ flexShrink: 0, width: FRAME_W, height: FRAME_H, transform: `scale(${SLIDE_SCALE})`, transformOrigin: 'top center' }}>
                <Component content={slice} mode={mode} index={idx} />
              </div>
            ) : (
              <div style={{ color: '#fff', fontFamily: mxMono, fontSize: 12, padding: 24, opacity: 0.5 }}>
                {slice?.sliceKey ?? 'No slides'}
              </div>
            )}
            {/* dynamic island */}
            <div style={{ position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)', width: 110, height: 32, borderRadius: 999, background: '#000', zIndex: 30 }} />
          </div>
        </div>

        {/* controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => setPlaying(v => !v)} style={{
            width: 40, height: 40, borderRadius: '50%', background: p.hot, color: p.cream,
            border: `2px solid ${p.ink}`, fontSize: 14, cursor: 'pointer', fontFamily: mxFont, fontWeight: 800,
          }}>{playing ? '❚❚' : '▶'}</button>
          <button onClick={onClose} style={{
            background: 'transparent', border: '1.5px solid rgba(255,255,255,0.3)',
            color: '#fff', fontFamily: mxMono, fontSize: 11, padding: '8px 14px',
            borderRadius: 999, cursor: 'pointer', letterSpacing: '0.1em',
          }}>← BACK TO DASHBOARD</button>
        </div>
      </div>

      {/* next */}
      <button onClick={next} disabled={idx === total - 1} style={{ ...navBtnBase, background: idx === total - 1 ? '#333' : p.lime, color: idx === total - 1 ? '#666' : p.ink, cursor: idx === total - 1 ? 'default' : 'pointer' }}>→</button>
    </div>
  );
}
