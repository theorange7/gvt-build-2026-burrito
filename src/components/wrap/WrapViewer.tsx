'use client';

import { WrapExperience } from '@/components/wrap/WrapExperience';
import { useLocalWrap } from '@/lib/local-store/hooks';

export function WrapViewer({ id }: { id: string }) {
  const wrap = useLocalWrap(id);

  if (wrap === undefined) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0a0a0f] text-white">
        <p className="text-sm text-white/55">Loading wrap…</p>
      </main>
    );
  }

  if (wrap === null) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0a0a0f] px-4 text-center text-white">
        <div className="rounded-[28px] border border-white/10 bg-[#111118] px-8 py-10">
          <p className="text-xs uppercase tracking-[0.36em] text-white/45">Wrap unavailable</p>
          <h1 className="mt-4 font-display text-4xl">This wrap isn&apos;t on this device.</h1>
          <p className="mt-4 max-w-md text-sm leading-7 text-white/56">
            Wraps are stored locally — they only exist on the device that generated them. Generate a new Snapshot or Year-End wrap from the dashboard.
          </p>
        </div>
      </main>
    );
  }

  return <WrapExperience id={wrap.id} mode={wrap.mode} title={wrap.title} slices={wrap.sliceContent} />;
}
