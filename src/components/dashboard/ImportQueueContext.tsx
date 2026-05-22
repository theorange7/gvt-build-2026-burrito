'use client';

/*
 * Spec 50 (timeline UX revision) — client-side queue for file-upload
 * imports. The /import endpoint is synchronous server-side (no Service
 * Bus, no Table Storage — that's the spec 50 privacy guarantee), so this
 * queue is purely in-memory: each enqueued item maps to one fetch call;
 * we cap concurrency at MAX_CONCURRENT_IMPORTS in flight. Completed rows
 * pop after AUTO_POP_DELAY_MS so the user sees the brief "✓ done" state
 * before it disappears.
 *
 * Lifetime is the page session — if the user closes the tab mid-upload,
 * the upload is gone. That mirrors the spec's "in memory only, no
 * persistence" posture and keeps the implementation simple.
 *
 * Review step (spec 50 follow-up):
 *   Between extraction and persistence the user gets a "review and
 *   confirm" pass. Rows the LLM couldn't date are auto-dated to the
 *   upload day and flagged so the user can spot them at a glance. The
 *   user can edit any field; confirm writes the (possibly edited) rows
 *   to the encrypted store; cancel marks the import as failed. The
 *   modal is mounted by the provider so it's available wherever the
 *   queue is — the page tree doesn't need to remember it.
 *
 * Defenses against the realistic failure modes:
 *   - pauseIdleLock() bracket around each run() so the encrypt-on-write
 *     after the fetch can't fail with "locked" while a slow upload runs.
 *   - beforeunload guard attaches only while at least one row is queued,
 *     running, or awaiting review.
 *
 * Testability:
 *   - The orchestrator pipeline (connect-identity + encrypted bulk-add)
 *     is reached through the RunImport seam, defaulted to the real
 *     implementation. Unit tests inject a controllable async fn so the
 *     scheduler can be exercised without IndexedDB or the network.
 *   - MAX_CONCURRENT_IMPORTS and AUTO_POP_DELAY_MS are exported so tests
 *     can assert against them and advance fake timers deterministically.
 *   - The review hook is exposed as an `onReview` arg on RunImport, so
 *     tests can drive the awaiting-review state without going through
 *     the orchestrator.
 *   - See test/component/ImportQueueContext.test.tsx for the full set.
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
  type ReviewableContribution,
} from '@/lib/providers/orchestrator';
import type { NormalizedContribution } from '@/lib/providers/types';
import { ReviewImportModal } from './ReviewImportModal';

export const MAX_CONCURRENT_IMPORTS = 3;
export const AUTO_POP_DELAY_MS = 1500;

export type ImportResult = {
  added: number;
  skippedExisting: number;
  rejectedRows: number;
};

/** Re-exported so consumers don't have to reach into the orchestrator. */
export type { ReviewableContribution } from '@/lib/providers/orchestrator';

/**
 * Callback the queue hands to the import runner. The runner invokes it
 * after extraction with the extracted rows; the queue suspends the item
 * in the `awaiting-review` state until the user confirms (returns edited
 * rows) or cancels (returns null).
 */
export type ReviewCallback = (
  rows: ReviewableContribution[],
) => Promise<NormalizedContribution[] | null>;

/**
 * Seam for unit tests: the production path runs connect-identity +
 * encrypted bulk-add; tests inject a controllable async fn instead so
 * the scheduler can be exercised without touching IndexedDB or the
 * network. The runner is also given an `onReview` callback to drive the
 * review-modal state; tests may invoke it or ignore it.
 */
export type RunImport = (args: {
  label: string;
  modelId: string;
  file: File;
  onReview: ReviewCallback;
}) => Promise<ImportResult>;

const defaultRunImport: RunImport = async ({ label, modelId, file, onReview }) => {
  const { identityId } = await connectFileUploadIdentity({ label });
  return importIntoIdentity(identityId, file, { modelId, label, review: onReview });
};

/**
 * Lifecycle of an enqueued upload row:
 *   queued           waiting for a slot; the scheduler will start it next.
 *   running          in flight via runImport(); occupies one of MAX_CONCURRENT_IMPORTS.
 *   awaiting-review  extraction done; modal open, waiting for user to confirm or cancel.
 *   complete         runImport resolved; counts (added / skippedExisting /
 *                    rejectedRows) are filled in. Auto-popped after AUTO_POP_DELAY_MS.
 *   failed           runImport rejected (or user cancelled the review); `error`
 *                    carries the message. Auto-popped on the same delay.
 */
export type ImportStatus = 'queued' | 'running' | 'awaiting-review' | 'complete' | 'failed';

/** A queue row as seen by consumers; the underlying File is not exposed. */
export type PendingImport = {
  id: string;
  label: string;
  modelId: string;
  status: ImportStatus;
  /** Filled when status is 'complete'. */
  added?: number;
  /** Filled when status is 'complete'. */
  skippedExisting?: number;
  /** Filled when status is 'complete'. */
  rejectedRows?: number;
  /** Filled when status is 'failed'. Surfaced verbatim in the UI. */
  error?: string;
};

/** A queue item that is currently sitting in the review modal. */
export type PendingReview = {
  id: string;
  label: string;
  rows: ReviewableContribution[];
};

type Action =
  | { type: 'enqueue'; item: InternalImport }
  | { type: 'start'; id: string }
  | { type: 'await-review'; id: string; rows: ReviewableContribution[] }
  | { type: 'resume'; id: string }
  | { type: 'complete'; id: string; result: ImportResult }
  | { type: 'fail'; id: string; error: string }
  | { type: 'remove'; id: string };

type InternalImport = PendingImport & {
  file: File;
  reviewable?: ReviewableContribution[];
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
    case 'await-review':
      return {
        items: state.items.map((i) =>
          i.id === action.id
            ? { ...i, status: 'awaiting-review', reviewable: action.rows }
            : i,
        ),
      };
    case 'resume':
      return {
        items: state.items.map((i) =>
          i.id === action.id ? { ...i, status: 'running', reviewable: undefined } : i,
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
                reviewable: undefined,
              }
            : i,
        ),
      };
    case 'fail':
      return {
        items: state.items.map((i) =>
          i.id === action.id
            ? { ...i, status: 'failed', error: action.error, reviewable: undefined }
            : i,
        ),
      };
    case 'remove':
      return { items: state.items.filter((i) => i.id !== action.id) };
  }
}

/**
 * Public surface of the import queue, returned by useImportQueue().
 *   - pending: snapshot of every queued / running / awaiting-review /
 *     settled (not yet auto-popped) row. The underlying File and the
 *     pending reviewable rows are intentionally stripped before exposure
 *     so consumers can't accidentally leak them into React state or
 *     props. Reviewable rows are accessed only through pendingReview.
 *   - pendingReview: the FIRST item currently awaiting review (or null).
 *     Concurrent imports surface their reviews one at a time so the
 *     modal never has to multiplex.
 *   - enqueue: adds a new upload; the scheduler picks it up on the next
 *     render. Returns immediately — completion is observed via pending.
 *   - confirmReview: commit the (possibly edited) rows for a review item.
 *     Resumes the run() that's blocked on the review callback.
 *   - cancelReview: abort the import for a review item. The runner sees
 *     a cancellation error; the queue moves the item to 'failed'.
 *   - remove: drop a row from the queue. Called by the auto-pop timer
 *     after AUTO_POP_DELAY_MS; exposed in case a future "✕" button on
 *     a pending row wants to cancel pre-emptively.
 */
export type ImportQueue = {
  pending: PendingImport[];
  pendingReview: PendingReview | null;
  enqueue(args: { label: string; modelId: string; file: File }): void;
  confirmReview(id: string, rows: NormalizedContribution[]): void;
  cancelReview(id: string): void;
  remove(id: string): void;
};

const ImportQueueContext = createContext<ImportQueue | null>(null);

/**
 * React provider that owns the in-memory upload queue. Also renders the
 * ReviewImportModal so any tree that has the queue available also gets
 * the modal — consumers don't need to remember to mount it.
 *
 * @param runImport  Override the import runner. Defaults to the real
 *                   orchestrator pipeline (connect identity + encrypted
 *                   bulk-add). Override in tests with a controllable
 *                   async fn — see RunImport for the contract.
 */
export function ImportQueueProvider({
  children,
  runImport = defaultRunImport,
}: {
  children: ReactNode;
  runImport?: RunImport;
}) {
  const [state, dispatch] = useReducer(reducer, { items: [] });
  const queryClient = useQueryClient();
  // Track ids we've already started — useEffect re-runs on every state
  // change, so a Set keeps starts strictly idempotent.
  const startedRef = useRef<Set<string>>(new Set());
  // Outstanding review promises, keyed by item id. confirmReview /
  // cancelReview resolve these so run() can continue past the await.
  const reviewResolversRef = useRef<
    Map<string, (value: NormalizedContribution[] | null) => void>
  >(new Map());

  // Scheduler: whenever the queue changes, fill open slots from the head.
  useEffect(() => {
    // Awaiting-review items still occupy a slot — they hold the
    // pauseIdleLock and have a pending promise — so they count toward
    // concurrency.
    const busy = state.items.filter(
      (i) => i.status === 'running' || i.status === 'awaiting-review',
    ).length;
    const slotsOpen = Math.max(0, MAX_CONCURRENT_IMPORTS - busy);
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
        const result = await runImport({
          label: item.label,
          modelId: item.modelId,
          file: item.file,
          onReview: (rows) =>
            new Promise((resolve) => {
              reviewResolversRef.current.set(item.id, resolve);
              dispatch({ type: 'await-review', id: item.id, rows });
            }),
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
        reviewResolversRef.current.delete(item.id);
        release();
      }
      setTimeout(() => dispatch({ type: 'remove', id: item.id }), AUTO_POP_DELAY_MS);
    }
  }, [state.items, queryClient, runImport]);

  // Warn before navigation/close if any upload is still in flight — the
  // queue is in-memory only, so a refresh or tab close drops it. The
  // browser shows its own generic copy; the empty-string return is
  // enough to trigger the prompt.
  useEffect(() => {
    const inFlight = state.items.some(
      (i) =>
        i.status === 'queued' ||
        i.status === 'running' ||
        i.status === 'awaiting-review',
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

  const confirmReview = useCallback<ImportQueue['confirmReview']>((id, rows) => {
    const resolve = reviewResolversRef.current.get(id);
    if (!resolve) return;
    reviewResolversRef.current.delete(id);
    dispatch({ type: 'resume', id });
    resolve(rows);
  }, []);

  const cancelReview = useCallback<ImportQueue['cancelReview']>((id) => {
    const resolve = reviewResolversRef.current.get(id);
    if (!resolve) return;
    reviewResolversRef.current.delete(id);
    // Runner will throw ImportCancelledError; the queue's catch surfaces
    // it as a 'failed' row with error='cancelled'.
    resolve(null);
  }, []);

  const remove = useCallback<ImportQueue['remove']>((id) => {
    dispatch({ type: 'remove', id });
  }, []);

  const value = useMemo<ImportQueue>(() => {
    const review = state.items.find(
      (i) => i.status === 'awaiting-review' && i.reviewable,
    );
    return {
      pending: state.items.map(
        ({ file: _file, reviewable: _reviewable, ...rest }) => rest,
      ),
      pendingReview: review
        ? { id: review.id, label: review.label, rows: review.reviewable! }
        : null,
      enqueue,
      confirmReview,
      cancelReview,
      remove,
    };
  }, [state.items, enqueue, confirmReview, cancelReview, remove]);

  return (
    <ImportQueueContext.Provider value={value}>
      {children}
      <ReviewImportModal />
    </ImportQueueContext.Provider>
  );
}

/**
 * Read the import queue. Must be called inside <ImportQueueProvider>.
 * Throws if no provider is mounted — that's a programmer error, not a
 * runtime concern, so we surface it loudly.
 */
export function useImportQueue(): ImportQueue {
  const ctx = useContext(ImportQueueContext);
  if (!ctx) {
    throw new Error('useImportQueue must be used inside <ImportQueueProvider>');
  }
  return ctx;
}
