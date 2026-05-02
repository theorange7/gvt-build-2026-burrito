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

function WrapPageInner() {
  const id = useSearchParams().get('id') ?? '';
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
