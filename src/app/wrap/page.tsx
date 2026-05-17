/*
 * Design philosophy: Editorial brutalism softened by institutional modernism.
 * File role: Deliver the wrap as an immersive, mobile-proportioned review artifact inside a full-screen viewer.
 * Guardrail: The experience should read like a curated report sequence rather than ten isolated cards.
 */
'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { UnlockGate } from '@/components/unlock/UnlockGate';
import { WrapViewer } from '@/components/wrap/WrapViewer';
import { PendingWrapView } from '@/components/wrap/PendingWrapView';
import { useLocalPendingWrap } from '@/lib/local-store/hooks';

function WrapPageInner() {
  const id = useSearchParams().get('id') ?? '';
  const pending = useLocalPendingWrap(id);

  if (pending === undefined) {
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
          }}
          className="flex items-center gap-3 px-8 py-6"
        >
          <span
            style={{ background: '#FF4D2E' }}
            className="inline-block h-2.5 w-2.5 animate-pulse"
          />
          <span
            style={{ color: '#0A0A0A', fontFamily: 'JetBrains Mono, monospace' }}
            className="text-xs uppercase tracking-[0.18em]"
          >
            Loading…
          </span>
        </div>
      </main>
    );
  }

  if (pending) {
    return (
      <UnlockGate>
        <PendingWrapView id={id} mode={pending.mode} />
      </UnlockGate>
    );
  }

  return (
    <UnlockGate>
      <WrapViewer id={id} />
    </UnlockGate>
  );
}

export default function WrapPage() {
  return (
    <Suspense fallback={null}>
      <WrapPageInner />
    </Suspense>
  );
}
