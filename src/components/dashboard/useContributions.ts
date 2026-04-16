'use client';

import { useQuery } from '@tanstack/react-query';
import type { Contribution } from '@/lib/types';

export const contributionsQueryKey = ['contributions'] as const;

export function useContributions(initialData?: Contribution[]) {
  return useQuery<Contribution[]>({
    queryKey: contributionsQueryKey,
    initialData,
    staleTime: 15_000,
    retry: 1,
    queryFn: async () => {
      const response = await fetch('/api/contributions');
      if (!response.ok) {
        throw new Error('Failed to load contributions.');
      }
      return response.json();
    },
  });
}
