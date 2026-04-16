'use client';

/*
 * Design philosophy: Editorial brutalism softened by institutional modernism.
 * File role: Keep app-wide providers invisible so page composition remains calm and publication-like.
 * Guardrail: Support interactivity without diluting the exhibit-like atmosphere.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode, useState } from 'react';

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
