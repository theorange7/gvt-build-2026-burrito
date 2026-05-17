'use client';

import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Contribution } from '@/lib/types';
import { listContributions } from './contributions';
import { getWrap, saveWrap, type StoredWrap } from './wraps';
import { hasActiveKey } from './crypto';
import {
  getPendingWrap,
  removePendingWrap,
  updatePendingWrap,
  type PendingWrap,
} from './pendingWraps';
import { pollWrap } from '@/lib/ai/generate';

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

export function useLocalPendingWrap(id: string) {
  return useLiveQuery<PendingWrap | null | undefined>(async () => {
    return getPendingWrap(id);
  }, [id]);
}

export type PendingPollState =
  | { phase: 'loading' }
  | { phase: 'queued' | 'running'; busy: boolean }
  | { phase: 'failed'; error: string }
  | { phase: 'complete' }
  | { phase: 'paused-locked' };

const BACKOFF_MS = [2000, 4000, 8000, 10000];

/**
 * Polls the backend for a pending wrap until it resolves. On `complete`,
 * persists the result via `saveWrap` (which encrypts at rest) and removes
 * the pending row so the wrap viewer can take over. On `failed`, surfaces
 * the error to the caller.
 */
export function usePendingWrap(id: string): PendingPollState {
  const [state, setState] = useState<PendingPollState>({ phase: 'loading' });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = false;
    let attempt = 0;

    const tick = async () => {
      if (!hasActiveKey()) {
        if (!cancelled.current) setState({ phase: 'paused-locked' });
        const resume = () => {
          window.removeEventListener('store-unlocked', resume);
          if (!cancelled.current) void tick();
        };
        window.addEventListener('store-unlocked', resume);
        return;
      }

      try {
        const pending = await getPendingWrap(id);
        if (!pending) {
          setState({ phase: 'complete' });
          return;
        }
        const result = await pollWrap(id);
        await updatePendingWrap(id, { lastCheckedAt: new Date(), status: result.status, busy: 'busy' in result ? !!result.busy : false });

        if (result.status === 'complete') {
          const title = pending.mode === 'year-end' ? 'Your year, wrapped for work.' : 'Your recent momentum, wrapped.';
          await saveWrap(
            {
              id,
              mode: pending.mode,
              windowStart: pending.windowStart,
              windowEnd: pending.windowEnd,
              title,
              sliceContent: result.sliceContent,
              shareSlug: result.shareSlug,
              shareUrl: result.shareUrl,
            },
          );
          await removePendingWrap(id);
          if (!cancelled.current) setState({ phase: 'complete' });
          return;
        }

        if (result.status === 'failed') {
          await removePendingWrap(id);
          if (!cancelled.current) setState({ phase: 'failed', error: result.error });
          return;
        }

        if (!cancelled.current) {
          setState({ phase: result.status, busy: !!result.busy });
        }
      } catch (err) {
        if (!cancelled.current) {
          setState({ phase: 'failed', error: err instanceof Error ? err.message : 'poll-failed' });
        }
        return;
      }

      const delay = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
      attempt += 1;
      if (!cancelled.current) {
        timer.current = setTimeout(tick, delay);
      }
    };

    void tick();

    return () => {
      cancelled.current = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [id]);

  return state;
}
