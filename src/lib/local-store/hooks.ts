'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import type { Contribution } from '@/lib/types';
import { listContributions } from './contributions';
import { getWrap, type StoredWrap } from './wraps';
import { hasActiveKey } from './crypto';

/**
 * Reactive contributions feed. Driven by Dexie's live query so writes from
 * any component (manual entry, provider sync, backfill) propagate without an
 * explicit cache invalidation. The previous implementation wrapped this in
 * `useQuery({ enabled: false, initialData })`, but React Query freezes
 * `initialData` after the first call — live updates after the first non-
 * undefined value were silently dropped.
 */
export function useLocalContributions(): { data: Contribution[] | undefined } {
  const data = useLiveQuery<Contribution[] | undefined>(async () => {
    if (!hasActiveKey()) return undefined;
    return listContributions();
  }, []);
  return { data };
}

export function useLocalWrap(id: string) {
  const data = useLiveQuery<StoredWrap | null | undefined>(async () => {
    if (!hasActiveKey()) return undefined;
    return getWrap(id);
  }, [id]);
  return data;
}
