'use client';

import { WrapExperience } from '@/components/wrap/WrapExperience';
import { useLocalWrap } from '@/lib/local-store/hooks';

export function WrapViewer({ id }: { id: string }) {
  const wrap = useLocalWrap(id);

  if (wrap === undefined) {
    return (
      <main
        style={{ background: '#FFF4DE' }}
        className="flex min-h-screen items-center justify-center"
      >
        <div
          style={{
            background: '#FBF5E5',
            border: '2px solid #0A0A0A',
            boxShadow: '3px 3px 0 #0A0A0A',
            fontFamily: 'JetBrains Mono, monospace',
          }}
          className="flex items-center gap-3 px-8 py-6"
        >
          {/* Animated pulse dot */}
          <span
            style={{ background: '#FF4D2E' }}
            className="inline-block h-2.5 w-2.5 animate-pulse"
          />
          <span
            style={{ color: '#0A0A0A', fontFamily: 'JetBrains Mono, monospace' }}
            className="text-xs uppercase tracking-[0.18em]"
          >
            Loading wrap&hellip;
          </span>
        </div>
      </main>
    );
  }

  if (wrap === null) {
    return (
      <main
        style={{ background: '#FFF4DE' }}
        className="flex min-h-screen items-center justify-center px-4 text-center"
      >
        <div
          style={{
            background: '#FBF5E5',
            border: '2px solid #0A0A0A',
            boxShadow: '3px 3px 0 #0A0A0A',
          }}
          className="px-8 py-10 max-w-md w-full"
        >
          <p
            style={{ fontFamily: 'JetBrains Mono, monospace', color: '#0A0A0A' }}
            className="text-xs uppercase tracking-[0.36em] opacity-60"
          >
            Wrap unavailable
          </p>
          <h1
            style={{ fontFamily: 'Space Grotesk, sans-serif', color: '#0A0A0A' }}
            className="mt-4 text-4xl font-black leading-tight"
          >
            This wrap isn&apos;t on this device.
          </h1>
          <p
            style={{ fontFamily: 'JetBrains Mono, monospace', color: '#0A0A0A' }}
            className="mt-4 text-xs leading-7 opacity-60"
          >
            Wraps are stored locally — they only exist on the device that generated them.
            Generate a new Snapshot or Year-End wrap from the dashboard.
          </p>
          <a
            href="/dashboard"
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              background: '#FF4D2E',
              border: '2px solid #0A0A0A',
              boxShadow: '3px 3px 0 #0A0A0A',
              color: '#0A0A0A',
            }}
            className="mt-6 inline-block px-6 py-2.5 text-xs uppercase tracking-[0.18em] font-bold hover:translate-x-[1px] hover:translate-y-[1px] transition-transform"
          >
            ← Back to Dashboard
          </a>
        </div>
      </main>
    );
  }

  return <WrapExperience id={wrap.id} mode={wrap.mode} title={wrap.title} slices={wrap.sliceContent} />;
}
