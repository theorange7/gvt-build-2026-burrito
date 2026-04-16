/*
 * Design philosophy: Editorial brutalism softened by institutional modernism.
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
      className="relative mx-auto flex h-[844px] w-[390px] flex-col overflow-hidden rounded-[42px] border border-white/8 bg-[#0a0a0f] px-8 py-8 shadow-[0_40px_120px_rgba(0,0,0,0.5)]"
      style={{
        backgroundImage: `radial-gradient(ellipse 80% 60% at 50% 0%, ${accent}22, transparent 70%), linear-gradient(180deg, rgba(255,255,255,0.02), transparent 22%)`,
      }}
    >
      <div className="flex items-center justify-between text-[0.62rem] uppercase tracking-[0.32em] text-white/45">
        <span>{String(index + 1).padStart(2, '0')} / 10</span>
        <span>{label}</span>
      </div>
      <div className="mt-12 flex flex-1 flex-col items-center justify-center text-center">
        {content.stat ? (
          <p className="font-display text-[72px] leading-[0.95]" style={{ color: accent }}>{content.stat}</p>
        ) : null}
        <h2 className={`mt-${content.stat ? '6' : '0'} font-display text-[30px] leading-[1.02] text-white ${mode === 'year-end' ? 'max-w-[290px] text-[32px]' : 'max-w-[276px]'}`}>
          {content.headline}
        </h2>
        <p className={`mt-5 max-w-[300px] text-[15px] leading-[1.6] text-white/62 ${mode === 'snapshot' ? 'text-[14px]' : ''}`}>
          {content.body}
        </p>
        {mode === 'year-end' && content.supporting?.length ? (
          <div className="mt-7 w-full max-w-[300px] space-y-3 text-left text-[13px] leading-6 text-white/56">
            {content.supporting.slice(0, 3).map((item) => (
              <div key={item} className="flex gap-3">
                <span style={{ color: accent }}>—</span>
                <span>{item}</span>
              </div>
            ))}
          </div>
        ) : null}
        {children}
      </div>
      <div className="mt-auto flex justify-center">
        <span className="rounded-full border border-white/8 px-3.5 py-1.5 text-[0.65rem] uppercase tracking-[0.28em] text-white/80" style={{ color: accent, borderColor: `${accent}55`, backgroundColor: `${accent}10` }}>
          {mode === 'snapshot' ? 'SNAPSHOT' : 'YEAR-END'}
        </span>
      </div>
      {mode === 'year-end' ? (
        <div className="absolute inset-x-0 bottom-0 h-2" style={{ background: `linear-gradient(90deg, transparent, ${accent}26, transparent)` }} />
      ) : null}
    </div>
  );
}
