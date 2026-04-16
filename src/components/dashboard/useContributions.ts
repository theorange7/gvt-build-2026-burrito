'use client';

import { useQuery } from '@tanstack/react-query';
import type { Contribution } from '@/lib/types';

export function useContributions(initialData?: Contribution[]) {
  return useQuery<Contribution[]>({
    queryKey: ['contributions'],
    initialData,
    queryFn: async () => {
      const response = await fetch('/api/contributions');
      if (!response.ok) {
        throw new Error('Failed to load contributions.');
      }
      return response.json();
    },
  });
}
