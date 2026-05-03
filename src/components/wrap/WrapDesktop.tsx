'use client';

/*
 * WrapDesktop — full-screen 16:9 maximalist wrap player (Burrito Maximalist design).
 * Canvas: 1600×900, scaled to fit viewport. 8 slide types, ticker strips, progress controls.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

/* ─── Palette ─────────────────────────────────────────────────────────────── */

interface MxPalette {
  hot: string;
  lime: string;
  ink: string;
  cream: string;
  paper: string;
  accent: string;
  accent2: string;
  accent3: string;
}

const DEFAULT_PALETTE: MxPalette = {
  hot: '#FF4D2E',
  lime: '#C6FF3B',
  ink: '#0A0A0A',
  cream: '#FFF4DE',
  paper: '#FBF5E5',
  accent: '#6B3DFF',
  accent2: '#7BE3FF',
  accent3: '#FFB3C7',
};

/* ─── Constants ───────────────────────────────────────────────────────────── */

const MXD_W = 1600;
const MXD_H = 900;

const mxMono = '"JetBrains Mono", "Fira Mono", "Courier New", monospace';
const mxSerif = '"Georgia", "Times New Roman", serif';

/* ─── Slide deck ─────────────────────────────────────────────────────────── */

type SlideKind = 'intro' | 'stat' | 'feature' | 'category' | 'people' | 'rhythm' | 'moment' | 'final';

interface SlideDef {
  kind: SlideKind;
  chapter: string;
  foot: string;
  dur: number;
}

const SLIDES: SlideDef[] = [
  { kind: 'intro',    chapter: 'OPENER',  foot: '— a year of work, caught quietly.',       dur: 5 },
  { kind: 'stat',     chapter: 'TOTALS',  foot: '— 181 things, four tools, one human.',    dur: 6 },
  { kind: 'feature',  chapter: 'BIGGEST', foot: '— shipping · payment-rail v2 · oct.',     dur: 7 },
  { kind: 'category', chapter: 'WEIGHT',  foot: '— what your year was actually about.',    dur: 6 },
  { kind: 'people',   chapter: 'OTHERS',  foot: '— the unblocks worth thanking.',          dur: 6 },
  { kind: 'rhythm',   chapter: 'TEMPO',   foot: '— peaks, valleys, one quiet weekday.',    dur: 6 },
  { kind: 'moment',   chapter: 'MOMENT',  foot: '— small things that counted.',            dur: 7 },
  { kind: 'final',    chapter: 'WRAPPED', foot: '— ready when you are.',                   dur: 8 },
];

/* ─── Ticker strip ───────────────────────────────────────────────────────── */

interface TickerProps {
  text: string;
  bg: string;
  color: string;
  top?: number;
  bottom?: number;
  rotate: number;
  inkColor: string;
}

function Ticker({ text, bg, color, top, bottom, rotate, inkColor }: TickerProps) {
  const repeated = Array(8).fill(text).join('  ✦  ');
  const style: React.CSSProperties = {
    position: 'absolute',
    left: -80,
    right: -80,
    background: bg,
    borderTop: `2px solid ${inkColor}`,
    borderBottom: `2px solid ${inkColor}`,
    fontFamily: mxMono,
    fontSize: 18,
    letterSpacing: '0.2em',
    fontWeight: 700,
    color,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    padding: '10px 0',
    transform: `rotate(${rotate}deg)`,
    transformOrigin: 'center center',
    zIndex: 2,
  };
  if (top !== undefined) style.top = top;
  if (bottom !== undefined) style.bottom = bottom;

  return <div style={style}>{repeated}</div>;
}

/* ─── Slide chrome ───────────────────────────────────────────────────────── */

interface ChromeProps {
  chapter: string;
  foot: string;
  index: number;
  total: number;
  p: MxPalette;
}

function SlideChrome({ chapter, foot, index, total, p }: ChromeProps) {
  return (
    <>
      {/* Top bar */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 48,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingLeft: 32,
        paddingRight: 32,
        fontFamily: mxMono,
        fontSize: 12,
        letterSpacing: '0.22em',
        color: p.ink,
        zIndex: 10,
        borderBottom: `1.5px solid ${p.ink}22`,
      }}>
        <span>BURRITO / 2026 WRAP / {chapter}</span>
        <span>desktop · 16:9 &nbsp;&nbsp; {index + 1} / {total}</span>
      </div>

      {/* Bottom bar */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 36,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingLeft: 32,
        paddingRight: 32,
        fontFamily: mxMono,
        fontSize: 11,
        letterSpacing: '0.15em',
        color: p.ink,
        opacity: 0.7,
        zIndex: 10,
        borderTop: `1.5px solid ${p.ink}22`,
      }}>
        <span>{foot}</span>
        <span>NOTHING SHARED · YOU CONTROL THE LINK 🔒</span>
      </div>
    </>
  );
}

/* ─── Individual slides ───────────────────────────────────────────────────── */

function SlideIntro({ p }: { p: MxPalette }) {
  return (
    <div style={{ position: 'absolute', inset: 0, background: p.hot, overflow: 'hidden' }}>
      {/* Ghost 2026 */}
      <div style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        fontSize: 720,
        fontFamily: mxSerif,
        fontStyle: 'italic',
        fontWeight: 900,
        color: p.lime,
        opacity: 0.18,
        lineHeight: 1,
        userSelect: 'none',
        whiteSpace: 'nowrap',
      }}>2026</div>

      {/* Tickers */}
      <Ticker text="YEAR IN REVIEW" bg={p.lime} color={p.ink} top={140} rotate={-3} inkColor={p.ink} />
      <Ticker text="A QUIET YEAR. A LOUD WRAP." bg={p.ink} color={p.cream} bottom={130} rotate={2} inkColor={p.ink} />

      {/* Center */}
      <div style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        gap: 12,
        zIndex: 3,
      }}>
        <div style={{ fontFamily: mxMono, fontSize: 14, color: p.cream, letterSpacing: '0.22em', opacity: 0.85 }}>
          ◍ PRESS PLAY · OR ANY KEY TO ADVANCE
        </div>
        <div style={{ fontSize: 220, fontFamily: mxSerif, fontWeight: 900, color: p.cream, lineHeight: 0.9, textShadow: `8px 8px 0 ${p.ink}` }}>
          YOUR YEAR,
        </div>
        <div style={{ fontSize: 220, fontFamily: mxSerif, fontStyle: 'italic', fontWeight: 900, color: p.lime, lineHeight: 0.9, textShadow: `8px 8px 0 ${p.ink}` }}>
          WRAPPED.
        </div>
        <div style={{ fontFamily: mxMono, fontSize: 16, color: p.cream, letterSpacing: '0.12em', opacity: 0.8, marginTop: 24 }}>
          181 contributions · 4 tools · 1 human year
        </div>
      </div>
    </div>
  );
}

function SlideStat({ p }: { p: MxPalette }) {
  const rows = [
    { label: 'SHIPPED',   num: 14,  sub: 'features & fixes' },
    { label: 'REVIEWED',  num: 142, sub: 'pull requests' },
    { label: 'UNBLOCKED', num: 12,  sub: 'teammates' },
    { label: 'WROTE',     num: 6,   sub: 'docs & ADRs' },
  ];
  return (
    <div style={{ position: 'absolute', inset: 0, background: p.lime, overflow: 'hidden', display: 'flex' }}>
      {/* Left half */}
      <div style={{ flex: 1, position: 'relative', padding: '80px 40px 60px 60px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
        <div style={{ fontFamily: mxMono, fontSize: 72, fontWeight: 700, color: p.accent, transform: 'rotate(-4deg)', transformOrigin: 'left center', letterSpacing: '0.04em', marginBottom: 8 }}>
          YOU CAUGHT
        </div>
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <div style={{ fontSize: 720, fontFamily: mxSerif, fontStyle: 'italic', fontWeight: 900, color: p.ink, lineHeight: 0.78, userSelect: 'none' }}>
            181
          </div>
          {/* +34 sticker */}
          <div style={{
            position: 'absolute',
            top: 40,
            right: -60,
            background: p.cream,
            border: `2px solid ${p.ink}`,
            boxShadow: `8px 8px 0 ${p.ink}`,
            padding: '8px 18px',
            transform: 'rotate(-8deg)',
            fontFamily: mxMono,
            fontSize: 36,
            fontWeight: 900,
            color: p.hot,
            whiteSpace: 'nowrap',
            zIndex: 4,
          }}>
            +34 vs &apos;25
          </div>
        </div>
        <div style={{ fontSize: 36, fontFamily: mxSerif, color: p.ink, marginTop: -20 }}>
          contributions, all year.
        </div>
      </div>

      {/* Right half */}
      <div style={{ width: 560, padding: '80px 60px 60px 60px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 0, borderLeft: `2px solid ${p.ink}` }}>
        {rows.map((row, i) => (
          <div key={row.label} style={{ borderBottom: i < rows.length - 1 ? `2px solid ${p.ink}` : 'none', padding: '24px 0' }}>
            <div style={{ fontFamily: mxMono, fontSize: 18, color: p.accent, letterSpacing: '0.18em', fontWeight: 700 }}>{row.label}</div>
            <div style={{ fontSize: 78, fontFamily: mxSerif, fontStyle: 'italic', color: p.hot, lineHeight: 0.9, fontWeight: 900 }}>{row.num}</div>
            <div style={{ fontSize: 16, fontFamily: mxMono, color: p.ink, opacity: 0.7 }}>{row.sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SlideFeature({ p }: { p: MxPalette }) {
  const sparkline = [168, 155, 162, 148, 140, 155, 135, 122, 118, 108, 105, 101];
  const sparkMax = Math.max(...sparkline);
  const sparkMin = Math.min(...sparkline);
  const sparkH = 80;
  return (
    <div style={{ position: 'absolute', inset: 0, background: p.accent, overflow: 'hidden' }}>
      {/* Ghost 40% */}
      <div style={{
        position: 'absolute',
        right: -120,
        top: '50%',
        transform: 'translateY(-50%)',
        fontSize: 1280,
        fontFamily: mxSerif,
        fontStyle: 'italic',
        fontWeight: 900,
        color: p.hot,
        lineHeight: 0.78,
        textShadow: `12px 12px 0 ${p.ink}`,
        opacity: 0.22,
        userSelect: 'none',
        whiteSpace: 'nowrap',
      }}>40%</div>

      {/* Left column */}
      <div style={{ position: 'absolute', left: 60, top: 130, width: 700 }}>
        <div style={{
          display: 'inline-block',
          background: p.lime,
          color: p.ink,
          fontFamily: mxMono,
          fontSize: 13,
          letterSpacing: '0.22em',
          fontWeight: 700,
          padding: '4px 14px',
          marginBottom: 24,
        }}>
          BIGGEST WIN · SHIPPING
        </div>
        <div style={{ fontSize: 110, fontFamily: mxSerif, fontWeight: 900, color: p.cream, lineHeight: 0.88 }}>
          you cut p99 latency by forty percent.
        </div>
        <div style={{ fontSize: 22, fontFamily: mxMono, color: p.cream, opacity: 0.82, lineHeight: 1.45, marginTop: 28, maxWidth: 620 }}>
          payment-rail v2 · shipped oct · pr #4821 reduced tail latency from 168ms to 101ms. owned the rollout solo across three environments.
        </div>
        {/* Tag chips */}
        <div style={{ display: 'flex', gap: 10, marginTop: 22, flexWrap: 'wrap' }}>
          {['#shipping', '#leadership', '#pr-4821', '#payment-rail', '#oct'].map(tag => (
            <span key={tag} style={{
              fontFamily: mxMono,
              fontSize: 13,
              color: p.lime,
              background: `${p.lime}22`,
              border: `1.5px solid ${p.lime}`,
              padding: '4px 12px',
              letterSpacing: '0.1em',
            }}>{tag}</span>
          ))}
        </div>
      </div>

      {/* Bottom-right inset card */}
      <div style={{
        position: 'absolute',
        right: 60,
        bottom: 60,
        width: 360,
        background: p.cream,
        border: `2px solid ${p.ink}`,
        boxShadow: `10px 10px 0 ${p.ink}`,
        padding: '20px 24px',
      }}>
        <div style={{ fontFamily: mxMono, fontSize: 11, letterSpacing: '0.2em', color: p.accent, marginBottom: 10 }}>P99 LATENCY · MS</div>
        {/* Sparkline */}
        <svg width="312" height={sparkH + 20} style={{ display: 'block' }}>
          {sparkline.map((v, i) => {
            const x = (i / (sparkline.length - 1)) * 312;
            const y = sparkH - ((v - sparkMin) / (sparkMax - sparkMin)) * sparkH + 10;
            return (
              <g key={i}>
                <circle cx={x} cy={y} r={i === 0 || i === sparkline.length - 1 ? 5 : 3} fill={i === sparkline.length - 1 ? p.hot : p.ink} />
                {i < sparkline.length - 1 && (
                  <line
                    x1={x}
                    y1={y}
                    x2={(i + 1) / (sparkline.length - 1) * 312}
                    y2={sparkH - ((sparkline[i + 1] - sparkMin) / (sparkMax - sparkMin)) * sparkH + 10}
                    stroke={p.ink}
                    strokeWidth={2}
                  />
                )}
              </g>
            );
          })}
        </svg>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: mxMono, fontSize: 13, fontWeight: 700 }}>
          <span style={{ color: p.ink }}>{sparkline[0]}ms</span>
          <span style={{ color: p.hot }}>→ {sparkline[sparkline.length - 1]}ms</span>
        </div>
        <div style={{ fontFamily: mxMono, fontSize: 11, color: p.ink, opacity: 0.6, marginTop: 6 }}>OCT · PAYMENT-RAIL V2</div>
      </div>
    </div>
  );
}

function SlideCategory({ p }: { p: MxPalette }) {
  const segments = [
    { label: 'SHIPPING',      pct: 38, color: p.hot },
    { label: 'REVIEW',        pct: 28, color: p.accent },
    { label: 'COLLAB',        pct: 16, color: p.lime },
    { label: 'MENTORSHIP',    pct: 11, color: p.accent2 },
    { label: 'PROCESS',       pct: 7,  color: p.accent3 },
  ];
  return (
    <div style={{ position: 'absolute', inset: 0, background: p.cream, overflow: 'hidden' }}>
      {/* Label */}
      <div style={{ position: 'absolute', top: 80, left: 60, fontFamily: mxMono, fontSize: 14, letterSpacing: '0.22em', color: p.accent }}>
        ◍ TOP CATEGORY · WEIGHTED
      </div>

      {/* Giant word */}
      <div style={{
        position: 'absolute',
        top: 110,
        left: 60,
        fontSize: 320,
        fontFamily: mxSerif,
        fontStyle: 'italic',
        fontWeight: 900,
        color: p.hot,
        lineHeight: 0.88,
        textShadow: `10px 10px 0 ${p.ink}22`,
      }}>
        shipping.
      </div>

      {/* Bottom section */}
      <div style={{ position: 'absolute', bottom: 60, left: 60, right: 60 }}>
        <div style={{ fontSize: 18, fontFamily: mxMono, color: p.ink, opacity: 0.7, marginBottom: 20, maxWidth: 800 }}>
          38% of your work touched shipping — features, fixes, and rollouts. more than any other category, every single quarter.
        </div>
        {/* Segmented bar */}
        <div style={{ display: 'flex', height: 80, border: `2px solid ${p.ink}`, boxShadow: `8px 8px 0 ${p.ink}`, overflow: 'hidden' }}>
          {segments.map((seg, i) => (
            <div key={seg.label} style={{
              flex: seg.pct,
              background: seg.color,
              borderRight: i < segments.length - 1 ? `2.5px solid ${p.ink}` : 'none',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
              overflow: 'hidden',
            }}>
              <span style={{ fontFamily: mxMono, fontSize: 11, fontWeight: 700, color: p.ink, letterSpacing: '0.12em', whiteSpace: 'nowrap' }}>
                {seg.label}
              </span>
              <span style={{ fontFamily: mxMono, fontSize: 18, fontWeight: 900, color: p.ink }}>{seg.pct}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SlidePeople({ p }: { p: MxPalette }) {
  const names = ['maya', 'carlos', 'priya', 'devon', 'seo-yeon', 'tomás', 'anya', 'jae', 'felix', 'riya', 'omar'];
  const chipStyles = (i: number): React.CSSProperties => {
    const rotations = [2, -3, 1.5, -2, 3, -1, 2.5, -2.5, 1, -3, 2];
    const isTop3 = i < 3;
    const isLast = i === names.length - 1;
    return {
      display: 'inline-flex',
      alignItems: 'center',
      padding: '14px 22px',
      fontSize: 32,
      fontFamily: mxSerif,
      fontStyle: isTop3 ? 'italic' : 'normal',
      fontWeight: 700,
      background: isLast ? p.ink : isTop3 ? p.hot : p.cream,
      color: isLast || isTop3 ? p.cream : p.ink,
      border: `2px solid ${p.ink}`,
      transform: `rotate(${rotations[i]}deg)`,
      margin: '6px 8px',
    };
  };
  return (
    <div style={{ position: 'absolute', inset: 0, background: p.accent2, overflow: 'hidden' }}>
      {/* Label */}
      <div style={{ position: 'absolute', top: 80, left: 60, fontFamily: mxMono, fontSize: 14, letterSpacing: '0.22em', color: p.ink }}>
        ◍ YOU MADE OTHERS FASTER
      </div>

      {/* Headline */}
      <div style={{ position: 'absolute', top: 120, left: 60, right: 60 }}>
        <div style={{ fontSize: 80, fontFamily: mxSerif, fontWeight: 900, color: p.ink, lineHeight: 0.92 }}>
          you helped{' '}
          <span style={{ fontSize: 220, fontStyle: 'italic', color: p.hot, verticalAlign: 'baseline', lineHeight: 0.78 }}>12</span>
          {' '}teammates ship faster.
        </div>
        <div style={{ fontFamily: mxMono, fontSize: 18, color: p.ink, opacity: 0.7, marginTop: 24, maxWidth: 700 }}>
          unblocks, reviews, and late-friday saves. they moved because you showed up.
        </div>
      </div>

      {/* Name chips */}
      <div style={{ position: 'absolute', bottom: 60, left: 40, right: 40, display: 'flex', flexWrap: 'wrap', alignItems: 'center' }}>
        {names.map((name, i) => (
          <div key={name} style={chipStyles(i)}>{name}</div>
        ))}
      </div>
    </div>
  );
}

function SlideRhythm({ p }: { p: MxPalette }) {
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const values = [8, 12, 15, 11, 14, 18, 10, 22, 16, 38, 24, 13];
  const maxVal = Math.max(...values);
  const chartH = 480;
  const barW = 42;
  const gap = 14;
  const totalW = months.length * (barW + gap) - gap;

  return (
    <div style={{ position: 'absolute', inset: 0, background: p.ink, overflow: 'hidden', display: 'flex' }}>
      {/* Left */}
      <div style={{ flex: 1, padding: '80px 40px 60px 60px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-start' }}>
        <div style={{ fontFamily: mxMono, fontSize: 14, letterSpacing: '0.22em', color: p.lime, marginBottom: 24 }}>
          ◍ YOUR MONTH · YOUR RHYTHM
        </div>
        <div style={{ fontSize: 360, fontFamily: mxSerif, fontStyle: 'italic', fontWeight: 900, color: p.hot, lineHeight: 0.82 }}>
          OCT.
        </div>
        <div style={{ fontFamily: mxMono, fontSize: 18, color: p.cream, opacity: 0.7, marginTop: 28, maxWidth: 540, lineHeight: 1.5 }}>
          your highest-output month by volume. 38 contributions — 3× your quietest month. you were in the work.
        </div>
      </div>

      {/* Right — bar chart */}
      <div style={{ width: 700, padding: '80px 40px 80px 40px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', borderLeft: `2px solid ${p.cream}22` }}>
        <div style={{ fontFamily: mxMono, fontSize: 12, letterSpacing: '0.18em', color: p.cream, opacity: 0.5, marginBottom: 16 }}>
          CONTRIBUTIONS · BY MONTH
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: gap, height: chartH }}>
          {values.map((v, i) => {
            const h = (v / maxVal) * (chartH - 40);
            const isPeak = v === maxVal;
            const isHigh = v > maxVal * 0.6;
            const barColor = isPeak ? p.hot : isHigh ? p.lime : '#2a2a2a';
            return (
              <div key={months[i]} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                {isPeak && (
                  <div style={{ fontFamily: mxMono, fontSize: 10, color: p.hot, letterSpacing: '0.15em', fontWeight: 700 }}>PEAK</div>
                )}
                <div style={{
                  width: barW,
                  height: h,
                  background: barColor,
                  border: isPeak ? `2px solid ${p.ink}` : 'none',
                }} />
                <div style={{ fontFamily: mxMono, fontSize: 10, color: p.cream, opacity: 0.55, letterSpacing: '0.1em' }}>{months[i]}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SlideMoment({ p }: { p: MxPalette }) {
  return (
    <div style={{ position: 'absolute', inset: 0, background: p.cream, overflow: 'hidden' }}>
      {/* Ticker */}
      <Ticker
        text="THE SMALLEST UNBLOCK · FRIDAY 4:47 PM"
        bg={p.hot}
        color={p.cream}
        top={70}
        rotate={-2}
        inkColor={p.ink}
      />

      {/* Quote */}
      <div style={{ position: 'absolute', top: 160, left: 60, right: 60 }}>
        <div style={{ fontSize: 80, fontFamily: mxSerif, fontWeight: 700, color: p.accent, lineHeight: 1, marginBottom: 12 }}>&ldquo;</div>
        <div style={{ fontSize: 84, fontFamily: mxSerif, fontStyle: 'italic', fontWeight: 700, color: p.ink, lineHeight: 1.1, maxWidth: 1300 }}>
          deploy is wedged. anyone around? need a second pair of eyes before i page on-call.
        </div>
      </div>

      {/* Attribution */}
      <div style={{ position: 'absolute', top: 520, left: 60, display: 'flex', alignItems: 'center', gap: 18 }}>
        <div style={{
          width: 54,
          height: 54,
          borderRadius: '50%',
          background: p.accent3,
          border: `2px solid ${p.ink}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: mxMono,
          fontSize: 20,
          fontWeight: 700,
          color: p.ink,
        }}>M</div>
        <div>
          <div style={{ fontFamily: mxSerif, fontSize: 24, fontWeight: 700, color: p.ink }}>marcus · #onboarding-sq</div>
          <div style={{ fontFamily: mxMono, fontSize: 13, color: p.ink, opacity: 0.6, letterSpacing: '0.12em', marginTop: 4 }}>
            SEP 22 · 16:47 · YOU REPLIED IN 3 MINUTES
          </div>
        </div>
      </div>

      {/* BURRITO NOTICED box */}
      <div style={{
        position: 'absolute',
        bottom: 60,
        left: 60,
        right: 60,
        background: p.ink,
        color: p.cream,
        borderLeft: `12px solid ${p.hot}`,
        boxShadow: `8px 8px 0 ${p.lime}`,
        padding: '20px 28px',
      }}>
        <div style={{ fontFamily: mxMono, fontSize: 12, letterSpacing: '0.25em', color: p.lime, marginBottom: 8 }}>BURRITO NOTICED</div>
        <div style={{ fontFamily: mxMono, fontSize: 16, lineHeight: 1.5, opacity: 0.9 }}>
          you jumped in on a friday afternoon. the unblock saved a monday rollback for four engineers.
        </div>
      </div>
    </div>
  );
}

function SlideFinal({ p }: { p: MxPalette }) {
  const actions: Array<{ label: string; icon: string; bg: string; color: string; border: string }> = [
    { label: 'COPY SHARE LINK',  icon: '🔗', bg: p.hot,   color: p.cream, border: p.ink },
    { label: 'EDIT ANY SLIDE',   icon: '✎',  bg: p.cream, color: p.ink,   border: p.ink },
    { label: 'POST TO SLACK · #wins', icon: '#', bg: p.accent, color: p.cream, border: p.ink },
    { label: 'SAVE AS DRAFT',    icon: '◌',  bg: 'transparent', color: p.ink, border: p.ink },
  ];
  return (
    <div style={{ position: 'absolute', inset: 0, background: p.lime, overflow: 'hidden', display: 'flex' }}>
      {/* Ghost WRAP. */}
      <div style={{
        position: 'absolute',
        right: -80,
        top: '50%',
        transform: 'translateY(-50%)',
        fontSize: 720,
        fontFamily: mxSerif,
        fontStyle: 'italic',
        fontWeight: 900,
        color: p.hot,
        lineHeight: 0.82,
        opacity: 0.18,
        userSelect: 'none',
        whiteSpace: 'nowrap',
      }}>WRAP.</div>

      {/* Ticker */}
      <Ticker
        text="EDIT ANY SLIDE · NOTHING LEAVES UNTIL YOU SAY"
        bg={p.ink}
        color={p.cream}
        top={120}
        rotate={-2}
        inkColor={p.ink}
      />

      {/* Left column */}
      <div style={{ flex: 1, padding: '200px 40px 80px 60px', zIndex: 3 }}>
        <div style={{ fontFamily: mxMono, fontSize: 13, letterSpacing: '0.28em', color: p.ink, marginBottom: 32 }}>WRAPPED.</div>
        <div style={{ fontSize: 180, fontFamily: mxSerif, fontWeight: 900, color: p.ink, lineHeight: 0.88 }}>a wrap</div>
        <div style={{ fontSize: 180, fontFamily: mxSerif, fontStyle: 'italic', fontWeight: 900, color: p.hot, lineHeight: 0.88, textShadow: `8px 8px 0 ${p.ink}` }}>
          worth sharing.
        </div>
        <div style={{ fontFamily: mxMono, fontSize: 16, color: p.ink, opacity: 0.7, marginTop: 28, maxWidth: 540, lineHeight: 1.55 }}>
          everything stayed local. nothing was sent. your story — yours to share, yours to keep, yours to edit.
        </div>
      </div>

      {/* Right column — action buttons */}
      <div style={{ width: 560, padding: '200px 60px 80px 40px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 16, zIndex: 3 }}>
        {actions.map((a, i) => (
          <div key={i} style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            background: a.bg,
            color: a.color,
            border: `2px solid ${a.border}`,
            boxShadow: i === 0 ? `6px 6px 0 ${p.ink}` : 'none',
            padding: '18px 24px',
            fontFamily: mxMono,
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: '0.1em',
            cursor: 'pointer',
          }}>
            <span style={{ fontSize: 26 }}>{a.icon}</span>
            {a.label}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Slide renderer ─────────────────────────────────────────────────────── */

function renderSlide(kind: SlideKind, p: MxPalette) {
  switch (kind) {
    case 'intro':    return <SlideIntro p={p} />;
    case 'stat':     return <SlideStat p={p} />;
    case 'feature':  return <SlideFeature p={p} />;
    case 'category': return <SlideCategory p={p} />;
    case 'people':   return <SlidePeople p={p} />;
    case 'rhythm':   return <SlideRhythm p={p} />;
    case 'moment':   return <SlideMoment p={p} />;
    case 'final':    return <SlideFinal p={p} />;
  }
}

/* ─── WrapDesktop ────────────────────────────────────────────────────────── */

export interface WrapDesktopProps {
  p?: MxPalette;
  onClose?: () => void;
}

export function WrapDesktop({ p = DEFAULT_PALETTE, onClose }: WrapDesktopProps) {
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [scale, setScale] = useState(1);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const total = SLIDES.length;

  /* Scale calculation */
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

  /* Auto-advance */
  useEffect(() => {
    if (!playing) return;
    const dur = SLIDES[current].dur * 1000;
    timerRef.current = setTimeout(() => {
      setCurrent(c => (c + 1 < total ? c + 1 : c));
    }, dur);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [current, playing, total]);

  /* Keyboard */
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

  const slide = SLIDES[current];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#000',
        zIndex: 70,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* ── Top chrome ── */}
      <div style={{
        height: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingLeft: 20,
        paddingRight: 20,
        borderBottom: '1px solid #222',
        flexShrink: 0,
      }}>
        {/* Back */}
        <button
          onClick={onClose}
          style={{
            fontFamily: mxMono,
            fontSize: 13,
            color: '#fff',
            background: 'transparent',
            border: '1px solid #444',
            padding: '6px 16px',
            cursor: 'pointer',
            letterSpacing: '0.1em',
          }}
        >
          ← BACK
        </button>

        {/* Progress segments */}
        <div style={{ display: 'flex', gap: 4, flex: 1, margin: '0 20px' }}>
          {SLIDES.map((s, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              title={s.chapter}
              style={{
                flex: 1,
                height: 6,
                background: i === current ? p.hot : i < current ? '#555' : '#222',
                border: 'none',
                cursor: 'pointer',
                transition: 'background 0.2s',
              }}
            />
          ))}
        </div>

        {/* Slide info */}
        <div style={{ fontFamily: mxMono, fontSize: 12, color: '#888', letterSpacing: '0.18em', whiteSpace: 'nowrap' }}>
          {slide.chapter} &nbsp; {current + 1} / {total}
        </div>
      </div>

      {/* ── Stage ── */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
        {/* Prev arrow */}
        <button
          onClick={() => setCurrent(c => Math.max(c - 1, 0))}
          disabled={current === 0}
          style={{
            position: 'absolute',
            left: 10,
            zIndex: 5,
            fontFamily: mxMono,
            fontSize: 28,
            color: current === 0 ? '#333' : '#fff',
            background: 'transparent',
            border: 'none',
            cursor: current === 0 ? 'default' : 'pointer',
            padding: '8px 12px',
          }}
        >←</button>

        {/* Canvas */}
        <div
          style={{
            width: MXD_W,
            height: MXD_H,
            transform: `scale(${scale})`,
            transformOrigin: 'center center',
            position: 'relative',
            overflow: 'hidden',
            flexShrink: 0,
          }}
        >
          {renderSlide(slide.kind, p)}
          <SlideChrome chapter={slide.chapter} foot={slide.foot} index={current} total={total} p={p} />
        </div>

        {/* Next arrow */}
        <button
          onClick={() => setCurrent(c => Math.min(c + 1, total - 1))}
          disabled={current === total - 1}
          style={{
            position: 'absolute',
            right: 10,
            zIndex: 5,
            fontFamily: mxMono,
            fontSize: 28,
            color: current === total - 1 ? '#333' : '#fff',
            background: 'transparent',
            border: 'none',
            cursor: current === total - 1 ? 'default' : 'pointer',
            padding: '8px 12px',
          }}
        >→</button>
      </div>

      {/* ── Bottom chrome ── */}
      <div style={{
        height: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingLeft: 20,
        paddingRight: 20,
        borderTop: '1px solid #222',
        flexShrink: 0,
      }}>
        {/* Play/pause + hint */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button
            onClick={() => setPlaying(pl => !pl)}
            style={{
              fontFamily: mxMono,
              fontSize: 22,
              color: '#fff',
              background: 'transparent',
              border: '1px solid #444',
              width: 40,
              height: 40,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            {playing ? '❚❚' : '▶'}
          </button>
          <span style={{ fontFamily: mxMono, fontSize: 11, color: '#555', letterSpacing: '0.15em' }}>
            → ADVANCE &nbsp; ESC CLOSE &nbsp; P PLAY
          </span>
        </div>

        {/* Badges */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{
            fontFamily: mxMono,
            fontSize: 11,
            color: '#888',
            border: '1px solid #333',
            padding: '4px 10px',
            letterSpacing: '0.15em',
          }}>
            DESKTOP · 16:9
          </span>
          <span style={{
            fontFamily: mxMono,
            fontSize: 11,
            color: p.hot,
            border: `1px solid ${p.hot}`,
            padding: '4px 10px',
            letterSpacing: '0.15em',
          }}>
            TOMATO
          </span>
        </div>
      </div>
    </div>
  );
}
