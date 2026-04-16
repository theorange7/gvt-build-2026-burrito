'use client';

/*
 * Design philosophy: Editorial brutalism softened by institutional modernism.
 * File role: Orchestrate the wrap as a cinematic, scroll-snapped sequence that still feels measured and appraisal-ready.
 * Guardrail: Motion should elevate narrative pacing without becoming novelty.
 */
import { motion } from 'framer-motion';
import Link from 'next/link';
import { ComponentType, useEffect, useMemo, useRef, useState } from 'react';
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

type SlideComponentProps = {
  content: SliceContent;
  mode: WrapMode;
  index: number;
};

const componentBySliceKey: Record<string, ComponentType<SlideComponentProps>> = {
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

function FallbackSlide({ content, index }: { content: SliceContent; index: number }) {
  return (
    <article className="grain w-full max-w-5xl rounded-[36px] border border-white/10 bg-[rgba(17,17,24,0.94)] px-6 py-8 text-white shadow-[0_30px_120px_rgba(0,0,0,0.45)] md:px-10 md:py-12">
      <p className="text-xs uppercase tracking-[0.36em] text-white/45">
        {String(index + 1).padStart(2, '0')} / 10 · {content.sliceKey.replaceAll('_', ' ')}
      </p>
      <h2 className="mt-4 font-display text-[clamp(2.4rem,5vw,4rem)] leading-[0.95]">{content.headline}</h2>
      <p className="mt-6 max-w-3xl text-lg leading-8 text-white/72">{content.body}</p>
      {content.stat ? <p className="mt-8 text-sm uppercase tracking-[0.28em] text-[color:var(--accent)]">{content.stat}</p> : null}
    </article>
  );
}

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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sectionRefs = useRef<Array<HTMLElement | null>>([]);
  const [activeSlide, setActiveSlide] = useState(0);
  const [shareMessage, setShareMessage] = useState<string | null>(null);

  const totalPanels = useMemo(() => slices.length + 1, [slices.length]);

  useEffect(() => {
    const nodes = sectionRefs.current.filter((node): node is HTMLElement => Boolean(node));

    if (!nodes.length) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visibleEntry = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

        if (!visibleEntry) {
          return;
        }

        const index = nodes.findIndex((node) => node === visibleEntry.target);
        if (index >= 0) {
          setActiveSlide(index + 1);
        }
      },
      { threshold: [0.4, 0.6, 0.8] },
    );

    nodes.forEach((node) => observer.observe(node));

    return () => {
      observer.disconnect();
    };
  }, [slices]);

  useEffect(() => {
    if (!shareMessage) {
      return;
    }

    const timer = window.setTimeout(() => setShareMessage(null), 2500);
    return () => window.clearTimeout(timer);
  }, [shareMessage]);

  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setShareMessage('Link copied.');
    } catch {
      setShareMessage('Copy failed on this browser.');
    }
  };

  return (
    <div ref={containerRef} data-wrap-id={id} className="h-screen overflow-y-auto scroll-smooth snap-y snap-mandatory scrollbar-hidden bg-[#08080d]">
      <div className="pointer-events-none fixed inset-x-0 top-0 z-30 flex items-center justify-between px-4 py-4 md:px-8">
        <Link href="/dashboard" className="pointer-events-auto rounded-full border border-white/10 bg-black/30 px-4 py-2 text-sm text-white/75 backdrop-blur">← Back</Link>
        <div className="flex items-center gap-3">
          <div className="flex flex-col items-end gap-2">
            <button onClick={share} className="pointer-events-auto rounded-full border border-white/10 bg-black/30 px-4 py-2 text-sm text-white/75 backdrop-blur">Share</button>
            {shareMessage ? <p className="pointer-events-auto text-xs text-[color:var(--accent)]">{shareMessage}</p> : null}
          </div>
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
        const Component = componentBySliceKey[slice.sliceKey];

        return (
          <section
            key={`${slice.sliceKey}-${index}`}
            ref={(node) => {
              sectionRefs.current[index] = node;
            }}
            className="flex min-h-screen snap-start items-center justify-center px-4 py-24"
          >
            {Component ? <Component content={slice} mode={mode} index={index} /> : <FallbackSlide content={slice} index={index} />}
          </section>
        );
      })}
    </div>
  );
}
