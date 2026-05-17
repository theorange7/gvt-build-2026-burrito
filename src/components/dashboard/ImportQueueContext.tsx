'use client';

/*
 * Spec 50 (timeline UX revision) — client-side queue for file-upload
 * imports. The /import endpoint is synchronous server-side (no Service
 * Bus, no Table Storage — that's the spec 50 privacy guarantee), so this
 * queue is purely in-memory: each enqueued item maps to one fetch call;
 * we cap concurrency at 3 in flight. Completed rows pop after a short
 * delay so the user sees the brief "✓ done" state before it disappears.
 *
 * Lifetime is the page session — if the user closes the tab mid-upload,
 * the upload is gone. That mirrors the spec's "in memory only, no
 * persistence" posture and keeps the implementation simple.
 */
import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from 'react';
import { pauseIdleLock } from '@/lib/local-store/crypto';
import {
  connectFileUploadIdentity,
  importIntoIdentity,
} from '@/lib/providers/orchestrator';

export const MAX_CONCURRENT_IMPORTS = 3;
const AUTO_POP_DELAY_MS = 1500;

export type ImportStatus = 'queued' | 'running' | 'complete' | 'failed';

export type PendingImport = {
  id: string;
  label: string;
  modelId: string;
  status: ImportStatus;
  added?: number;
  skippedExisting?: number;
  rejectedRows?: number;
  error?: string;
};

type Action =
  | { type: 'enqueue'; item: InternalImport }
  | { type: 'start'; id: string }
  | { type: 'complete'; id: string; result: { added: number; skippedExisting: number; rejectedRows: number } }
  | { type: 'fail'; id: string; error: string }
  | { type: 'remove'; id: string };

type InternalImport = PendingImport & {
  file: File;
};

type State = {
  items: InternalImport[];
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'enqueue':
      return { items: [...state.items, action.item] };
    case 'start':
      return {
        items: state.items.map((i) =>
          i.id === action.id ? { ...i, status: 'running' } : i,
        ),
      };
    case 'complete':
      return {
        items: state.items.map((i) =>
          i.id === action.id
            ? {
                ...i,
                status: 'complete',
                added: action.result.added,
                skippedExisting: action.result.skippedExisting,
                rejectedRows: action.result.rejectedRows,
              }
            : i,
        ),
      };
    case 'fail':
      return {
        items: state.items.map((i) =>
          i.id === action.id ? { ...i, status: 'failed', error: action.error } : i,
        ),
      };
    case 'remove':
      return { items: state.items.filter((i) => i.id !== action.id) };
  }
}

export type ImportQueue = {
  pending: PendingImport[];
  enqueue(args: { label: string; modelId: string; file: File }): void;
  remove(id: string): void;
};

const ImportQueueContext = createContext<ImportQueue | null>(null);

export function ImportQueueProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, { items: [] });
  const queryClient = useQueryClient();
  // Track ids we've already started — useEffect re-runs on every state
  // change, so a Set keeps starts strictly idempotent.
  const startedRef = useRef<Set<string>>(new Set());

  // Scheduler: whenever the queue changes, fill open slots from the head.
  useEffect(() => {
    const running = state.items.filter((i) => i.status === 'running').length;
    const slotsOpen = Math.max(0, MAX_CONCURRENT_IMPORTS - running);
    if (slotsOpen === 0) return;
    const next = state.items
      .filter((i) => i.status === 'queued' && !startedRef.current.has(i.id))
      .slice(0, slotsOpen);
    for (const item of next) {
      startedRef.current.add(item.id);
      dispatch({ type: 'start', id: item.id });
      void run(item);
    }

    async function run(item: InternalImport) {
      // Keep the encryption key alive across the network call so the
      // encrypt-on-write at the end doesn't fail with "locked" if the
      // user wanders away from the tab mid-extraction. Hard-capped in
      // crypto.ts so a hung upload can't keep the store unlocked.
      const release = pauseIdleLock();
      try {
        const { identityId } = await connectFileUploadIdentity({ label: item.label });
        const result = await importIntoIdentity(identityId, item.file, {
          modelId: item.modelId,
          label: item.label,
        });
        dispatch({ type: 'complete', id: item.id, result });
        queryClient.invalidateQueries({ queryKey: ['contributions'] });
        queryClient.invalidateQueries({ queryKey: ['identities'] });
      } catch (err) {
        dispatch({
          type: 'fail',
          id: item.id,
          error: err instanceof Error ? err.message : 'import-failed',
        });
      } finally {
        release();
      }
      setTimeout(() => dispatch({ type: 'remove', id: item.id }), AUTO_POP_DELAY_MS);
    }
  }, [state.items, queryClient]);

  // Warn before navigation/close if any upload is still in flight — the
  // queue is in-memory only, so a refresh or tab close drops it. The
  // browser shows its own generic copy; the empty-string return is
  // enough to trigger the prompt.
  useEffect(() => {
    const inFlight = state.items.some(
      (i) => i.status === 'queued' || i.status === 'running',
    );
    if (!inFlight) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [state.items]);

  const enqueue = useCallback<ImportQueue['enqueue']>((args) => {
    dispatch({
      type: 'enqueue',
      item: {
        id: crypto.randomUUID(),
        label: args.label,
        modelId: args.modelId,
        file: args.file,
        status: 'queued',
      },
    });
  }, []);

  const remove = useCallback<ImportQueue['remove']>((id) => {
    dispatch({ type: 'remove', id });
  }, []);

  const value = useMemo<ImportQueue>(
    () => ({
      pending: state.items.map(({ file: _file, ...rest }) => rest),
      enqueue,
      remove,
    }),
    [state.items, enqueue, remove],
  );

  return <ImportQueueContext.Provider value={value}>{children}</ImportQueueContext.Provider>;
}

export function useImportQueue(): ImportQueue {
  const ctx = useContext(ImportQueueContext);
  if (!ctx) {
    throw new Error('useImportQueue must be used inside <ImportQueueProvider>');
  }
  return ctx;
}
