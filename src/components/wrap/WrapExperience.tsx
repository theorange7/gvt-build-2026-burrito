'use client';

/*
 * Design philosophy: Editorial brutalism softened by institutional modernism.
 * File role: Orchestrate the wrap as a cinematic, scroll-snapped sequence that still feels measured and appraisal-ready.
 * Guardrail: Motion should elevate narrative pacing without becoming novelty.
 */
import { motion } from 'framer-motion';
import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';
import type { SliceContent, WrapMode } from '@/lib/types';
import { LaunchesShipped } from '@/components/slides/LaunchesShipped';
import { Velocity } from '@/components/slides/Velocity';
import { CrossTeamImpact } from '@/components/slides/CrossTeamImpact';
import { DeepWorkStreak } from '@/components/slides/DeepWorkStreak';
import { Mentorship } from '@/components/slides/Mentorship';
import { Initiative } from '@/components/slides/Initiative';
import { CollaborationStyle } from '@/components/slides/CollaborationStyle';
import { Consistency } from '@/components/slides/Consistency';
import { HighlightReel } from '@/components/slides/HighlightReel';
import { Identity } from '@/components/slides/Identity';

const components = [
  LaunchesShipped,
  Velocity,
  CrossTeamImpact,
  DeepWorkStreak,
  Mentorship,
  Initiative,
  CollaborationStyle,
  Consistency,
  HighlightReel,
  Identity,
] as const;

export function WrapExperience({
  id,
  mode,
  title,
  slices,
}: {
  id: string;
  mode: WrapMode;
  title: string;
  slices: SliceContent[];
}) {
  const sectionRefs = useRef<Array<HTMLElement | null>>([]);
  const [activeSlide, setActiveSlide] = useState(0);

  const totalPanels = useMemo(() => slices.length + 1, [slices.length]);

  const exportJson = () => {
    const payload = { id, mode, title, slices };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wrap-${mode}-${id.slice(0, 8)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-screen overflow-y-auto scroll-smooth snap-y snap-mandatory scrollbar-hidden bg-[#08080d]">
      <div className="pointer-events-none fixed inset-x-0 top-0 z-30 flex items-center justify-between px-4 py-4 md:px-8">
        <Link href="/dashboard" className="pointer-events-auto rounded-full border border-white/10 bg-black/30 px-4 py-2 text-sm text-white/75 backdrop-blur">← Back</Link>
        <div className="flex items-center gap-3">
          <button onClick={exportJson} className="pointer-events-auto rounded-full border border-white/10 bg-black/30 px-4 py-2 text-sm text-white/75 backdrop-blur">Export</button>
          <div className="rounded-full border border-white/10 bg-black/30 px-4 py-2 text-sm text-white/75 backdrop-blur">{Math.min(activeSlide + 1, totalPanels)} / {totalPanels}</div>
        </div>
      </div>

      <section className="relative flex min-h-screen snap-start items-center justify-center px-4 py-20">
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6 }}
          className="grain flex w-full max-w-4xl flex-col items-center rounded-[42px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,107,53,0.12),transparent_24%),rgba(17,17,24,0.92)] px-8 py-16 text-center shadow-[0_40px_120px_rgba(0,0,0,0.55)]"
        >
          <p className="text-xs uppercase tracking-[0.38em] text-white/45">Wrapped for Work</p>
          <h1 className="mt-5 font-display text-[clamp(3rem,8vw,6rem)] leading-[0.92] text-white">{title}</h1>
          <p className="mt-5 text-lg text-white/56">{mode === 'year-end' ? '2025' : 'Apr → Jun 2025'}</p>
          <span className="mt-6 rounded-full border border-[rgba(255,107,53,0.45)] bg-[rgba(255,107,53,0.1)] px-4 py-2 text-xs uppercase tracking-[0.32em] text-[color:var(--accent)]">{mode === 'snapshot' ? 'SNAPSHOT' : 'YEAR-END'}</span>
          <button
            type="button"
            onClick={() => sectionRefs.current[0]?.scrollIntoView({ behavior: 'smooth' })}
            className="mt-10 animate-bounce rounded-full border border-white/10 px-4 py-2 text-sm text-white/75"
          >
            Tap to begin
          </button>
        </motion.div>
      </section>

      {slices.map((slice, index) => {
        const Component = components[index];
        return (
          <section
            key={slice.sliceKey}
            ref={(node) => {
              sectionRefs.current[index] = node;
              if (node) {
                const observer = new IntersectionObserver(
                  ([entry]) => {
                    if (entry.isIntersecting) {
                      setActiveSlide(index + 1);
                    }
                  },
                  { threshold: 0.6 },
                );
                observer.observe(node);
              }
            }}
            className="flex min-h-screen snap-start items-center justify-center px-4 py-24"
          >
            <Component content={slice} mode={mode} index={index} />
          </section>
        );
      })}
    </div>
  );
}
