/*
 * Design philosophy: Burrito Maximalist — bold per-slide color blocks, hard ink borders,
 * offset drop shadows, italic display type with text-shadow, ghost numerals, rotated pill chips.
 * File role: Provide the shared slide grammar so each chapter feels like part of one authored
 * publication — same compositional grammar in phone (390×844) and desktop (1440×760) variants.
 * Guardrail: Preserve hierarchy, disciplined accent usage, and the editorial weight of the type.
 */
import type { CSSProperties, ReactNode } from 'react';
import type { SliceContent, WrapMode } from '@/lib/types';

export type SlideVariant = 'phone' | 'desktop';

const INK = '#0A0A0A';
const CREAM = '#FFF4DE';
const PAPER = '#FBF5E5';
const HOT = '#FF4D2E';
const LIME = '#C6FF3B';
const PURPLE = '#6B3DFF';
const SKY = '#7BE3FF';
const ROSE = '#FFB3C7';

type Theme = { bg: string; fg: string; accent: string };

/**
 * Per-slice color blocks. The wrap is meant to feel like a sequenced publication
 * where each chapter has its own visual identity — hot opener, calm middle, ink finale.
 */
const THEMES: Record<string, Theme> = {
  launches_shipped: { bg: HOT, fg: CREAM, accent: LIME },
  velocity: { bg: LIME, fg: INK, accent: PURPLE },
  cross_team_impact: { bg: SKY, fg: INK, accent: HOT },
  deep_work_streak: { bg: INK, fg: CREAM, accent: LIME },
  mentorship: { bg: ROSE, fg: INK, accent: PURPLE },
  initiative: { bg: PURPLE, fg: CREAM, accent: LIME },
  collaboration_style: { bg: PAPER, fg: INK, accent: HOT },
  consistency: { bg: CREAM, fg: INK, accent: SKY },
  highlight_reel: { bg: INK, fg: CREAM, accent: HOT },
  identity: { bg: LIME, fg: INK, accent: PURPLE },
};

const FALLBACK: Theme = { bg: CREAM, fg: INK, accent: HOT };

const mxFont = 'Space Grotesk, sans-serif';
const mxMono = 'JetBrains Mono, monospace';

export function SlideFrame({
  content,
  mode,
  index,
  label,
  accent: accentOverride,
  variant = 'phone',
  children,
}: {
  content: SliceContent;
  mode: WrapMode;
  index: number;
  label: string;
  accent: string;
  variant?: SlideVariant;
  children?: ReactNode;
}) {
  const theme = THEMES[content.sliceKey] ?? FALLBACK;
  const { bg, fg } = theme;
  // Slide's own accent override wins; fallback to theme accent.
  const accent = accentOverride || theme.accent;
  const isDark = bg === INK || bg === PURPLE || bg === HOT;
  const statShadow = isDark ? `5px 5px 0 ${accent}` : `5px 5px 0 ${INK}`;
  const showStat = Boolean(content.stat);

  return variant === 'desktop'
    ? renderDesktop({ content, mode, index, label, accent, bg, fg, isDark, statShadow, showStat, children })
    : renderPhone({ content, mode, index, label, accent, bg, fg, isDark, statShadow, showStat, children });
}

interface RenderArgs {
  content: SliceContent;
  mode: WrapMode;
  index: number;
  label: string;
  accent: string;
  bg: string;
  fg: string;
  isDark: boolean;
  statShadow: string;
  showStat: boolean;
  children?: ReactNode;
}

/* ─── Phone variant (390×844) ─────────────────────────────────────────────── */

function renderPhone({
  content, mode, index, label, accent, bg, fg, isDark, statShadow, showStat, children,
}: RenderArgs) {
  return (
    <div
      style={{
        background: bg,
        color: fg,
        border: `2px solid ${INK}`,
        boxShadow: `6px 6px 0 ${INK}`,
        fontFamily: mxFont,
      }}
      className="relative mx-auto flex h-[844px] w-[390px] flex-col overflow-hidden px-7 py-7"
    >
      {/* Top header band: title left / counter right */}
      <div
        style={{ fontFamily: mxMono, color: fg, opacity: 0.85 }}
        className="flex items-center justify-between text-[10px] uppercase tracking-[0.22em]"
      >
        <span>WRAPPED FOR WORK · 2026</span>
        <span>{String(index + 1).padStart(2, '0')} / 10</span>
      </div>

      {/* Topline label */}
      <div
        style={{ fontFamily: mxMono, color: accent }}
        className="mt-6 text-[12px] uppercase tracking-[0.28em] font-bold"
      >
        / {label}
      </div>

      {/* Ghost numeral behind */}
      {showStat ? <GhostNumeral text={content.stat!} bg={bg} fg={fg} variant="phone" /> : null}

      {/* Main content */}
      <div className="relative z-10 mt-2 flex flex-1 flex-col">
        {showStat ? (
          <p
            style={{
              fontFamily: mxFont,
              color: fg,
              textShadow: statShadow,
              fontStyle: 'italic',
              letterSpacing: '-0.05em',
            }}
            className="text-[112px] font-black leading-[0.85]"
          >
            {content.stat}
          </p>
        ) : null}

        <h2
          style={{
            fontFamily: mxFont,
            color: fg,
            fontStyle: 'italic',
            letterSpacing: '-0.03em',
          }}
          className={`font-black leading-[0.95] ${showStat ? 'mt-5' : 'mt-2'} max-w-[320px] text-[34px]`}
        >
          {content.headline}
        </h2>

        <p
          style={{ fontFamily: mxFont, color: fg, opacity: 0.85 }}
          className="mt-4 max-w-[320px] text-[14px] leading-[1.55]"
        >
          {content.body}
        </p>

        {mode === 'year-end' && content.supporting?.length ? (
          <div className="mt-5 flex flex-wrap gap-2">
            {content.supporting.slice(0, 4).map((item, i) => (
              <PillChip key={item} index={i} isDark={isDark} accent={accent} fg={fg}>
                {item}
              </PillChip>
            ))}
          </div>
        ) : null}

        {children}
      </div>

      {/* Bottom row: mode badge + lock note */}
      <div className="relative z-10 mt-auto flex items-center justify-between">
        <span
          style={{
            fontFamily: mxMono,
            color: fg,
            background: isDark ? 'rgba(255,244,222,0.1)' : 'rgba(10,10,10,0.06)',
            border: `2px solid ${fg}`,
          }}
          className="px-3 py-1 text-[10px] uppercase tracking-[0.26em] font-bold"
        >
          {mode === 'snapshot' ? 'SNAPSHOT' : 'YEAR-END'}
        </span>
        <span
          style={{ fontFamily: mxMono, color: fg, opacity: 0.65 }}
          className="text-[9px] uppercase tracking-[0.15em]"
        >
          🔒 nothing shared
        </span>
      </div>

      {/* Accent stripe — year-end only */}
      {mode === 'year-end' ? (
        <div className="absolute inset-x-0 bottom-0 h-[4px]" style={{ background: accent }} />
      ) : null}
    </div>
  );
}

/* ─── Desktop variant (1440×760) ──────────────────────────────────────────── */

function renderDesktop({
  content, mode, index, label, accent, bg, fg, isDark, statShadow, showStat, children,
}: RenderArgs) {
  return (
    <div
      style={{
        background: bg,
        color: fg,
        border: `2px solid ${INK}`,
        boxShadow: `12px 12px 0 ${INK}`,
        fontFamily: mxFont,
      }}
      className="relative mx-auto flex h-[760px] w-[1440px] flex-col overflow-hidden px-16 py-12"
    >
      {/* Top header band */}
      <div
        style={{ fontFamily: mxMono, color: fg, opacity: 0.85 }}
        className="flex items-center justify-between text-[13px] uppercase tracking-[0.22em]"
      >
        <span>WRAPPED FOR WORK · 2026</span>
        <span>{String(index + 1).padStart(2, '0')} / 10</span>
      </div>

      {/* Topline label */}
      <div
        style={{ fontFamily: mxMono, color: accent }}
        className="mt-8 text-[15px] uppercase tracking-[0.3em] font-bold"
      >
        / {label}
      </div>

      {/* Ghost numeral behind */}
      {showStat ? <GhostNumeral text={content.stat!} bg={bg} fg={fg} variant="desktop" /> : null}

      {/* Two-column main */}
      <div className="relative z-10 mt-6 flex flex-1 items-center gap-20">
        {/* Left: giant stat */}
        <div className="flex flex-1 items-center justify-center">
          {showStat ? (
            <p
              style={{
                fontFamily: mxFont,
                color: fg,
                textShadow: statShadow,
                fontStyle: 'italic',
                letterSpacing: '-0.06em',
              }}
              className="text-[240px] font-black leading-[0.82] text-center"
            >
              {content.stat}
            </p>
          ) : (
            <p
              style={{
                fontFamily: mxFont,
                color: accent,
                fontStyle: 'italic',
                letterSpacing: '-0.04em',
                opacity: 0.95,
              }}
              className="text-[140px] font-black leading-[0.9] text-center"
            >
              {label.split(' ')[0]}.
            </p>
          )}
        </div>

        {/* Right: headline / body / supporting */}
        <div className="flex flex-1 flex-col">
          <h2
            style={{
              fontFamily: mxFont,
              color: fg,
              fontStyle: 'italic',
              letterSpacing: '-0.035em',
            }}
            className="text-[72px] font-black leading-[0.98]"
          >
            {content.headline}
          </h2>

          <p
            style={{ fontFamily: mxFont, color: fg, opacity: 0.85 }}
            className="mt-8 max-w-[560px] text-[22px] leading-[1.5]"
          >
            {content.body}
          </p>

          {mode === 'year-end' && content.supporting?.length ? (
            <div className="mt-10 flex max-w-[600px] flex-wrap gap-3">
              {content.supporting.slice(0, 4).map((item, i) => (
                <PillChip key={item} index={i} isDark={isDark} accent={accent} fg={fg} size="lg">
                  {item}
                </PillChip>
              ))}
            </div>
          ) : null}

          {children}
        </div>
      </div>

      {/* Bottom row */}
      <div className="relative z-10 mt-6 flex items-center justify-between">
        <span
          style={{
            fontFamily: mxMono,
            color: fg,
            background: isDark ? 'rgba(255,244,222,0.1)' : 'rgba(10,10,10,0.06)',
            border: `2px solid ${fg}`,
          }}
          className="px-5 py-2 text-[13px] uppercase tracking-[0.28em] font-bold"
        >
          {mode === 'snapshot' ? 'SNAPSHOT' : 'YEAR-END'}
        </span>
        <span
          style={{ fontFamily: mxMono, color: fg, opacity: 0.65 }}
          className="text-[11px] uppercase tracking-[0.18em]"
        >
          🔒 nothing has been sent · you control the link
        </span>
      </div>

      {/* Accent stripe — year-end only */}
      {mode === 'year-end' ? (
        <div className="absolute inset-x-0 bottom-0 h-[6px]" style={{ background: accent }} />
      ) : null}
    </div>
  );
}

/* ─── Decorative pieces ──────────────────────────────────────────────────── */

function GhostNumeral({
  text, bg, fg, variant,
}: { text: string; bg: string; fg: string; variant: SlideVariant }) {
  const isDarkBg = bg === INK || bg === PURPLE || bg === HOT;
  const ghostColor = isDarkBg ? fg : INK;
  const style: CSSProperties = {
    position: 'absolute',
    fontFamily: mxFont,
    fontStyle: 'italic',
    fontWeight: 800,
    color: ghostColor,
    opacity: isDarkBg ? 0.08 : 0.06,
    letterSpacing: '-0.08em',
    pointerEvents: 'none',
    lineHeight: 0.8,
    userSelect: 'none',
    whiteSpace: 'nowrap',
  };
  if (variant === 'desktop') {
    return (
      <span style={{ ...style, top: -40, right: -60, fontSize: 540, zIndex: 0 }}>
        {text}
      </span>
    );
  }
  return (
    <span style={{ ...style, top: 80, right: -30, fontSize: 320, zIndex: 0 }}>
      {text}
    </span>
  );
}

function PillChip({
  children, index, isDark, accent, fg, size = 'sm',
}: {
  children: ReactNode;
  index: number;
  isDark: boolean;
  accent: string;
  fg: string;
  size?: 'sm' | 'lg';
}) {
  // Alternating treatment: accent background, ink background, paper background.
  const variants = isDark
    ? [
        { bg: accent, color: INK },
        { bg: CREAM, color: INK },
        { bg: 'transparent', color: fg, border: `2px solid ${fg}` },
      ]
    : [
        { bg: accent, color: INK },
        { bg: INK, color: CREAM },
        { bg: '#fff', color: INK },
      ];
  const v = variants[index % variants.length];
  const rotate = ((index % 3) - 1) * 1.4;
  const padding = size === 'lg' ? '8px 16px' : '5px 12px';
  const fontSize = size === 'lg' ? 14 : 11;
  return (
    <span
      style={{
        fontFamily: mxMono,
        fontWeight: 700,
        fontSize,
        padding,
        background: v.bg,
        color: v.color,
        border: v.border ?? `2px solid ${INK}`,
        borderRadius: 999,
        transform: `rotate(${rotate}deg)`,
        letterSpacing: '0.04em',
        display: 'inline-block',
      }}
    >
      {children}
    </span>
  );
}
