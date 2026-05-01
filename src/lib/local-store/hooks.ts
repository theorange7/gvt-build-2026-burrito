'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { useQuery } from '@tanstack/react-query';
import type { Contribution } from '@/lib/types';
import { listContributions } from './contributions';
import { getWrap, type StoredWrap } from './wraps';
import { hasActiveKey } from './crypto';

export function useLocalContributions() {
  const data = useLiveQuery<Contribution[] | undefined>(async () => {
    if (!hasActiveKey()) return undefined;
    return listContributions();
  }, []);

  return useQuery<Contribution[]>({
    queryKey: ['contributions'],
    queryFn: async () => listContributions(),
    enabled: false,
    initialData: data,
  });
}

export function useLocalWrap(id: string) {
  const data = useLiveQuery<StoredWrap | null | undefined>(async () => {
    if (!hasActiveKey()) return undefined;
    return getWrap(id);
  }, [id]);
  return data;
}
