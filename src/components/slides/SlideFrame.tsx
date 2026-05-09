/*
 * Design philosophy: Editorial brutalism — light cream backgrounds, hard ink borders,
 * hard drop shadows, Space Grotesk display, JetBrains Mono for labels.
 * File role: Provide the shared slide grammar so each chapter feels like part of one authored publication.
 * Guardrail: Preserve hierarchy, generous negative space, and disciplined accent usage.
 */
import type { ReactNode } from 'react';
import type { SliceContent, WrapMode } from '@/lib/types';

export function SlideFrame({
  content,
  mode,
  index,
  label,
  accent,
  children,
}: {
  content: SliceContent;
  mode: WrapMode;
  index: number;
  label: string;
  accent: string;
  children?: ReactNode;
}) {
  return (
    <div
      style={{
        background: '#FFF4DE',
        border: '2px solid #0A0A0A',
        boxShadow: '6px 6px 0 #0A0A0A',
      }}
      className="relative mx-auto flex h-[844px] w-[390px] flex-col overflow-hidden px-8 py-8"
    >
      {/* Slide number + label */}
      <div
        style={{ fontFamily: 'JetBrains Mono, monospace', color: '#0A0A0A' }}
        className="flex items-center justify-between text-[0.62rem] uppercase tracking-[0.32em]"
      >
        <span
          style={{ border: '2px solid #0A0A0A', fontFamily: 'JetBrains Mono, monospace' }}
          className="px-2 py-0.5 text-[0.58rem]"
        >
          {String(index + 1).padStart(2, '0')}&nbsp;/&nbsp;10
        </span>
        <span>{label}</span>
      </div>

      {/* Main content */}
      <div className="mt-12 flex flex-1 flex-col items-center justify-center text-center">
        {content.stat ? (
          <p
            style={{ fontFamily: 'Space Grotesk, sans-serif', color: accent }}
            className="text-[72px] font-black leading-[0.95]"
          >
            {content.stat}
          </p>
        ) : null}
        <h2
          style={{ fontFamily: 'Space Grotesk, sans-serif', color: '#0A0A0A' }}
          className={`font-bold leading-[1.02] ${content.stat ? 'mt-6' : 'mt-0'} ${
            mode === 'year-end'
              ? 'max-w-[290px] text-[32px]'
              : 'max-w-[276px] text-[30px]'
          }`}
        >
          {content.headline}
        </h2>
        <p
          style={{ fontFamily: 'Space Grotesk, sans-serif', color: '#0A0A0A' }}
          className={`mt-5 max-w-[300px] leading-[1.6] opacity-60 ${
            mode === 'snapshot' ? 'text-[14px]' : 'text-[15px]'
          }`}
        >
          {content.body}
        </p>
        {mode === 'year-end' && content.supporting?.length ? (
          <div
            style={{ fontFamily: 'JetBrains Mono, monospace', color: '#0A0A0A' }}
            className="mt-7 w-full max-w-[300px] space-y-3 text-left text-[12px] leading-6"
          >
            {content.supporting.slice(0, 3).map((item) => (
              <div key={item} className="flex gap-3">
                <span style={{ color: accent }} className="font-bold">—</span>
                <span>{item}</span>
              </div>
            ))}
          </div>
        ) : null}
        {children}
      </div>

      {/* Mode badge at bottom */}
      <div className="mt-auto flex justify-center">
        <span
          style={{
            fontFamily: 'JetBrains Mono, monospace',
            color: '#0A0A0A',
            border: '2px solid #0A0A0A',
            background: accent + '33',
          }}
          className="px-4 py-1.5 text-[0.65rem] uppercase tracking-[0.28em]"
        >
          {mode === 'snapshot' ? 'SNAPSHOT' : 'YEAR-END'}
        </span>
      </div>

      {/* Bottom accent stripe for year-end */}
      {mode === 'year-end' ? (
        <div
          className="absolute inset-x-0 bottom-0 h-[3px]"
          style={{ background: accent }}
        />
      ) : null}
    </div>
  );
}
