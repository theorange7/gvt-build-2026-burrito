'use client';

/*
 * WrapDesktop — full-screen 16:9 wrap player.
 * Canvas: 1600×900, scaled to fit viewport. Slides rendered from real SliceContent via slides/ components.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
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

/* ─── Palette ─────────────────────────────────────────────────────────────── */

interface MxPalette {
  hot: string; lime: string; ink: string; cream: string;
  paper: string; accent: string; accent2: string; accent3: string;
}

const DEFAULT_PALETTE: MxPalette = {
  hot: '#FF4D2E', lime: '#C6FF3B', ink: '#0A0A0A', cream: '#FFF4DE',
  paper: '#FBF5E5', accent: '#6B3DFF', accent2: '#7BE3FF', accent3: '#FFB3C7',
};

/* ─── Constants ───────────────────────────────────────────────────────────── */

const MXD_W = 1600;
const MXD_H = 900;
const mxMono = '"JetBrains Mono", "Fira Mono", "Courier New", monospace';

// SlideFrame renders at 390×844. Chrome bars occupy 48+36=84px of the canvas height.
// Scale slides to fill available height with a small margin.
const FRAME_W = 390;
const FRAME_H = 844;
const AVAILABLE_H = MXD_H - 84 - 16; // minus chrome and 8px top/bottom margin
const SLIDE_SCALE = AVAILABLE_H / FRAME_H;

const SLIDE_DURATION_S = 6;

/* ─── Slice component map ─────────────────────────────────────────────────── */

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

function chapterFor(sliceKey: string): string {
  return sliceKey.replace(/_/g, ' ').toUpperCase();
}

/* ─── WrapDesktop ────────────────────────────────────────────────────────── */

export interface WrapDesktopProps {
  p?: MxPalette;
  onClose?: () => void;
  slices: SliceContent[];
  mode: WrapMode;
  title: string;
}

export function WrapDesktop({ p = DEFAULT_PALETTE, onClose, slices, mode, title }: WrapDesktopProps) {
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [scale, setScale] = useState(1);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const total = slices.length;

  const recalcScale = useCallback(() => {
    const padTop = 70, padBottom = 110, padX = 60;
    const w = window.innerWidth - padX * 2;
    const h = window.innerHeight - padTop - padBottom;
    setScale(Math.min(w / MXD_W, h / MXD_H, 1));
  }, []);

  useEffect(() => {
    recalcScale();
    window.addEventListener('resize', recalcScale);
    return () => window.removeEventListener('resize', recalcScale);
  }, [recalcScale]);

  useEffect(() => {
    if (!playing) return;
    timerRef.current = setTimeout(() => {
      setCurrent(c => (c + 1 < total ? c + 1 : c));
    }, SLIDE_DURATION_S * 1000);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [current, playing, total]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        setCurrent(c => Math.min(c + 1, total - 1));
      } else if (e.key === 'ArrowLeft') {
        setCurrent(c => Math.max(c - 1, 0));
      } else if (e.key === 'Escape') {
        onClose?.();
      } else if (e.key === 'p' || e.key === 'P') {
        setPlaying(pl => !pl);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [total, onClose]);

  const slice = slices[current];
  const Component = slice ? SLICE_MAP[slice.sliceKey] : null;
  const chapter = slice ? chapterFor(slice.sliceKey) : '';

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', zIndex: 70, display: 'flex', flexDirection: 'column' }}>
      {/* ── Top chrome ── */}
      <div style={{
        height: 50, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        paddingLeft: 20, paddingRight: 20, borderBottom: '1px solid #222', flexShrink: 0,
      }}>
        <button
          onClick={onClose}
          style={{ fontFamily: mxMono, fontSize: 13, color: '#fff', background: 'transparent', border: '1px solid #444', padding: '6px 16px', cursor: 'pointer', letterSpacing: '0.1em' }}
        >
          ← BACK
        </button>

        <div style={{ display: 'flex', gap: 4, flex: 1, margin: '0 20px' }}>
          {slices.map((s, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              title={chapterFor(s.sliceKey)}
              style={{ flex: 1, height: 6, background: i === current ? p.hot : i < current ? '#555' : '#222', border: 'none', cursor: 'pointer', transition: 'background 0.2s' }}
            />
          ))}
        </div>

        <div style={{ fontFamily: mxMono, fontSize: 12, color: '#888', letterSpacing: '0.18em', whiteSpace: 'nowrap' }}>
          {chapter} &nbsp; {current + 1} / {total}
        </div>
      </div>

      {/* ── Stage ── */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
        <button
          onClick={() => setCurrent(c => Math.max(c - 1, 0))}
          disabled={current === 0}
          style={{ position: 'absolute', left: 10, zIndex: 5, fontFamily: mxMono, fontSize: 28, color: current === 0 ? '#333' : '#fff', background: 'transparent', border: 'none', cursor: current === 0 ? 'default' : 'pointer', padding: '8px 12px' }}
        >←</button>

        {/* Canvas */}
        <div style={{ width: MXD_W, height: MXD_H, transform: `scale(${scale})`, transformOrigin: 'center center', position: 'relative', overflow: 'hidden', flexShrink: 0, background: '#111' }}>
          {/* Top chrome bar inside canvas */}
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 48,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            paddingLeft: 32, paddingRight: 32, fontFamily: mxMono, fontSize: 12,
            letterSpacing: '0.22em', color: '#aaa', zIndex: 10, borderBottom: '1.5px solid #333',
          }}>
            <span>WRAPPED FOR WORK / {chapter}</span>
            <span>{title}</span>
          </div>

          {/* Slide content centered in canvas */}
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {Component ? (
              <div style={{ flexShrink: 0, width: FRAME_W, height: FRAME_H, transform: `scale(${SLIDE_SCALE})`, transformOrigin: 'center center' }}>
                <Component content={slice} mode={mode} index={current} />
              </div>
            ) : (
              <div style={{ color: '#555', fontFamily: mxMono, fontSize: 14 }}>
                {slice?.sliceKey ?? 'No slides'}
              </div>
            )}
          </div>

          {/* Bottom chrome bar inside canvas */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, height: 36,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            paddingLeft: 32, paddingRight: 32, fontFamily: mxMono, fontSize: 11,
            letterSpacing: '0.15em', color: '#777', zIndex: 10, borderTop: '1.5px solid #333',
          }}>
            <span>{slice?.headline ?? ''}</span>
            <span>NOTHING SHARED · YOU CONTROL THE LINK 🔒</span>
          </div>
        </div>

        <button
          onClick={() => setCurrent(c => Math.min(c + 1, total - 1))}
          disabled={current === total - 1}
          style={{ position: 'absolute', right: 10, zIndex: 5, fontFamily: mxMono, fontSize: 28, color: current === total - 1 ? '#333' : '#fff', background: 'transparent', border: 'none', cursor: current === total - 1 ? 'default' : 'pointer', padding: '8px 12px' }}
        >→</button>
      </div>

      {/* ── Bottom chrome ── */}
      <div style={{
        height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        paddingLeft: 20, paddingRight: 20, borderTop: '1px solid #222', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button
            onClick={() => setPlaying(pl => !pl)}
            style={{ fontFamily: mxMono, fontSize: 22, color: '#fff', background: 'transparent', border: '1px solid #444', width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          >
            {playing ? '❚❚' : '▶'}
          </button>
          <span style={{ fontFamily: mxMono, fontSize: 11, color: '#555', letterSpacing: '0.15em' }}>
            → ADVANCE &nbsp; ESC CLOSE &nbsp; P PLAY
          </span>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontFamily: mxMono, fontSize: 11, color: '#888', border: '1px solid #333', padding: '4px 10px', letterSpacing: '0.15em' }}>
            DESKTOP · 16:9
          </span>
          <span style={{ fontFamily: mxMono, fontSize: 11, color: p.hot, border: `1px solid ${p.hot}`, padding: '4px 10px', letterSpacing: '0.15em' }}>
            {mode === 'year-end' ? 'YEAR-END' : 'SNAPSHOT'}
          </span>
        </div>
      </div>
    </div>
  );
}
