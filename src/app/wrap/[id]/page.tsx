/*
 * Design philosophy: Editorial brutalism softened by institutional modernism.
 * File role: Deliver the wrap as an immersive, mobile-proportioned review artifact inside a full-screen viewer.
 * Guardrail: The experience should read like a curated report sequence rather than ten isolated cards.
 */
import { WrapExperience } from '@/components/wrap/WrapExperience';
import { db } from '@/lib/db';
import type { SliceContent, WrapMode } from '@/lib/types';

export default async function WrapPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await db.wrapJob.findUnique({ where: { id } });

  if (!job || job.status !== 'complete' || !job.sliceContent) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0a0a0f] px-4 text-center text-white">
        <div className="rounded-[28px] border border-white/10 bg-[#111118] px-8 py-10">
          <p className="text-xs uppercase tracking-[0.36em] text-white/45">Wrap unavailable</p>
          <h1 className="mt-4 font-display text-4xl">This wrap is not ready yet.</h1>
          <p className="mt-4 max-w-md text-sm leading-7 text-white/56">Generate a new Snapshot or Year-End wrap from the dashboard, then come back once the job completes.</p>
        </div>
      </main>
    );
  }

  const slices = JSON.parse(job.sliceContent) as SliceContent[];
  const title = job.mode === 'year-end' ? 'Your year, wrapped for work.' : 'Your recent momentum, wrapped.';

  return <WrapExperience id={job.id} mode={job.mode as WrapMode} title={title} slices={slices} />;
}
