'use client';

/*
 * Design philosophy: Editorial brutalism softened by institutional modernism.
 * File role: Keep app-wide providers invisible so page composition remains calm and publication-like.
 * Guardrail: Support interactivity without diluting the exhibit-like atmosphere.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode, useState } from 'react';
import { ImportQueueProvider } from '@/components/dashboard/ImportQueueContext';

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      {/*
       * ImportQueueProvider must live inside QueryClientProvider so its
       * useQueryClient() call resolves. It owns the in-memory upload queue
       * for the dashboard but is lightweight to mount app-wide (empty queue
       * until something is enqueued; beforeunload guard only attaches while
       * items are in flight).
       */}
      <ImportQueueProvider>{children}</ImportQueueProvider>
    </QueryClientProvider>
  );
}
