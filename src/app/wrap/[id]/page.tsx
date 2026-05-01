/*
 * Design philosophy: Editorial brutalism softened by institutional modernism.
 * File role: Deliver the wrap as an immersive, mobile-proportioned review artifact inside a full-screen viewer.
 * Guardrail: The experience should read like a curated report sequence rather than ten isolated cards.
 */
import { use } from 'react';
import { UnlockGate } from '@/components/unlock/UnlockGate';
import { WrapViewer } from '@/components/wrap/WrapViewer';

export const dynamic = 'force-static';

export default function WrapPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <UnlockGate>
      <WrapViewer id={id} />
    </UnlockGate>
  );
}
