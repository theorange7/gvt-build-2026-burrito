/**
 * Unit tests for <ImportQueueProvider> — the in-memory upload queue
 * that owns concurrency, error handling, auto-pop, idle-lock pausing,
 * and the beforeunload guard. The orchestrator pipeline is reached via
 * the RunImport seam (defaulted to the real implementation), which lets
 * us drive the scheduler with deferred promises and assert behavior
 * without IndexedDB or the network.
 *
 * What's covered:
 *   - Concurrency cap (MAX_CONCURRENT_IMPORTS) holds under burst enqueue
 *   - Queued items start as slots free up
 *   - Successful runs surface counts and invalidate the query cache
 *   - Failed runs surface the error message
 *   - Both states auto-pop after AUTO_POP_DELAY_MS
 *   - beforeunload prevents navigation while items are in flight,
 *     stops preventing once the queue drains
 *
 * What's NOT covered here (left to E2E or integration tests):
 *   - The actual orchestrator pipeline (connect + bulk-add) — its own
 *     tests live under test/integration/providers/file-upload.test.ts.
 *   - The real DOM rendering of pending rows (PendingImportsList) —
 *     that's a presentational component, covered by screenshot tests.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  AUTO_POP_DELAY_MS,
  ImportQueueProvider,
  MAX_CONCURRENT_IMPORTS,
  type ImportQueue,
  type ImportResult,
  type ReviewableContribution,
  type RunImport,
  useImportQueue,
} from '@/components/dashboard/ImportQueueContext';
import type { NormalizedContribution } from '@/lib/providers/types';

/**
 * Tiny test seam: exposes the live queue value to the test body so we
 * can call enqueue() outside of render and read pending rows directly.
 * `queue` is a getter — useImportQueue() returns a new memo object on
 * every re-render, so we must always read the latest captured value
 * rather than snapshotting one at mount time.
 */
type Harness = {
  readonly queue: ImportQueue;
  runs: Deferred<ImportResult>[];
  queryClient: QueryClient;
  unmount: () => void;
};

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
};

function defer<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/**
 * Render the provider with a deferred-promise runner. Each enqueue
 * pushes a fresh Deferred onto `runs` so the test can resolve/reject
 * them in any order and observe how the scheduler reacts.
 */
function mountHarness(): Harness {
  const runs: Deferred<ImportResult>[] = [];
  const runImport: RunImport = () => {
    const d = defer<ImportResult>();
    runs.push(d);
    return d.promise;
  };

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  let queue: ImportQueue | null = null;
  function Capture() {
    queue = useImportQueue();
    return null;
  }
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <ImportQueueProvider runImport={runImport}>
          {children}
          <Capture />
        </ImportQueueProvider>
      </QueryClientProvider>
    );
  }

  const { unmount } = render(<Wrapper>{null}</Wrapper>);
  if (!queue) throw new Error('queue capture failed');
  return {
    get queue() {
      return queue as ImportQueue;
    },
    runs,
    queryClient,
    unmount,
  };
}

function fileFor(label: string): File {
  return new File([`bytes for ${label}`], `${label}.txt`, { type: 'text/plain' });
}

function statusCounts(harness: Harness): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of harness.queue.pending) {
    counts[item.status] = (counts[item.status] ?? 0) + 1;
  }
  return counts;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('<ImportQueueProvider>', () => {
  describe('concurrency cap', () => {
    it('starts at most MAX_CONCURRENT_IMPORTS items at once', () => {
      const h = mountHarness();

      act(() => {
        for (let i = 0; i < MAX_CONCURRENT_IMPORTS + 2; i += 1) {
          h.queue.enqueue({
            label: `batch-${i}`,
            modelId: 'anthropic:claude-sonnet-4',
            file: fileFor(`batch-${i}`),
          });
        }
      });

      const counts = statusCounts(h);
      expect(counts.running).toBe(MAX_CONCURRENT_IMPORTS);
      expect(counts.queued).toBe(2);
      // The scheduler should have asked the runner for exactly MAX
      // promises — not all five at once, and not zero.
      expect(h.runs).toHaveLength(MAX_CONCURRENT_IMPORTS);

      h.unmount();
    });

    it('starts a queued item as soon as a slot opens', async () => {
      const h = mountHarness();

      act(() => {
        for (let i = 0; i < MAX_CONCURRENT_IMPORTS + 1; i += 1) {
          h.queue.enqueue({
            label: `batch-${i}`,
            modelId: 'anthropic:claude-sonnet-4',
            file: fileFor(`batch-${i}`),
          });
        }
      });
      expect(statusCounts(h)).toMatchObject({
        running: MAX_CONCURRENT_IMPORTS,
        queued: 1,
      });

      // Complete the first running item — a slot opens, the queued
      // one starts. The just-completed one stays visible until the
      // auto-pop timer fires.
      await act(async () => {
        h.runs[0].resolve({ added: 1, skippedExisting: 0, rejectedRows: 0 });
      });

      const counts = statusCounts(h);
      expect(counts.running).toBe(MAX_CONCURRENT_IMPORTS);
      expect(counts.complete).toBe(1);
      expect(counts.queued ?? 0).toBe(0);
      expect(h.runs).toHaveLength(MAX_CONCURRENT_IMPORTS + 1);

      h.unmount();
    });
  });

  describe('settle states', () => {
    it('marks a completed item with the result counts', async () => {
      const h = mountHarness();
      act(() => {
        h.queue.enqueue({
          label: 'q1-commits',
          modelId: 'anthropic:claude-sonnet-4',
          file: fileFor('q1'),
        });
      });
      await act(async () => {
        h.runs[0].resolve({ added: 12, skippedExisting: 3, rejectedRows: 1 });
      });

      const item = h.queue.pending.find((p) => p.label === 'q1-commits');
      expect(item).toMatchObject({
        status: 'complete',
        added: 12,
        skippedExisting: 3,
        rejectedRows: 1,
      });

      h.unmount();
    });

    it('marks a failed item with the error message', async () => {
      const h = mountHarness();
      act(() => {
        h.queue.enqueue({
          label: 'bad-batch',
          modelId: 'anthropic:claude-sonnet-4',
          file: fileFor('bad'),
        });
      });
      await act(async () => {
        h.runs[0].reject(new Error('extract-failed'));
      });

      const item = h.queue.pending.find((p) => p.label === 'bad-batch');
      expect(item).toMatchObject({ status: 'failed', error: 'extract-failed' });

      h.unmount();
    });

    it('uses a generic error code for non-Error rejections', async () => {
      const h = mountHarness();
      act(() => {
        h.queue.enqueue({
          label: 'odd-batch',
          modelId: 'anthropic:claude-sonnet-4',
          file: fileFor('odd'),
        });
      });
      await act(async () => {
        h.runs[0].reject('not-an-error');
      });

      expect(h.queue.pending[0]).toMatchObject({
        status: 'failed',
        error: 'import-failed',
      });

      h.unmount();
    });
  });

  describe('auto-pop', () => {
    it('removes completed rows after AUTO_POP_DELAY_MS', async () => {
      const h = mountHarness();
      act(() => {
        h.queue.enqueue({
          label: 'will-disappear',
          modelId: 'anthropic:claude-sonnet-4',
          file: fileFor('disappear'),
        });
      });
      await act(async () => {
        h.runs[0].resolve({ added: 1, skippedExisting: 0, rejectedRows: 0 });
      });
      expect(h.queue.pending).toHaveLength(1);

      await act(async () => {
        vi.advanceTimersByTime(AUTO_POP_DELAY_MS);
      });
      expect(h.queue.pending).toHaveLength(0);

      h.unmount();
    });

    it('removes failed rows after AUTO_POP_DELAY_MS on the same delay', async () => {
      const h = mountHarness();
      act(() => {
        h.queue.enqueue({
          label: 'will-fail',
          modelId: 'anthropic:claude-sonnet-4',
          file: fileFor('fail'),
        });
      });
      await act(async () => {
        h.runs[0].reject(new Error('boom'));
      });
      expect(h.queue.pending).toHaveLength(1);

      await act(async () => {
        vi.advanceTimersByTime(AUTO_POP_DELAY_MS);
      });
      expect(h.queue.pending).toHaveLength(0);

      h.unmount();
    });
  });

  describe('query cache', () => {
    it('invalidates contributions and identities on a successful import', async () => {
      const h = mountHarness();
      const spy = vi.spyOn(h.queryClient, 'invalidateQueries');
      act(() => {
        h.queue.enqueue({
          label: 'q1',
          modelId: 'anthropic:claude-sonnet-4',
          file: fileFor('q1'),
        });
      });
      await act(async () => {
        h.runs[0].resolve({ added: 1, skippedExisting: 0, rejectedRows: 0 });
      });

      expect(spy).toHaveBeenCalledWith({ queryKey: ['contributions'] });
      expect(spy).toHaveBeenCalledWith({ queryKey: ['identities'] });

      h.unmount();
    });

    it('does not invalidate the cache on a failed import', async () => {
      const h = mountHarness();
      const spy = vi.spyOn(h.queryClient, 'invalidateQueries');
      act(() => {
        h.queue.enqueue({
          label: 'q1',
          modelId: 'anthropic:claude-sonnet-4',
          file: fileFor('q1'),
        });
      });
      await act(async () => {
        h.runs[0].reject(new Error('extract-failed'));
      });

      expect(spy).not.toHaveBeenCalled();

      h.unmount();
    });
  });

  describe('beforeunload guard', () => {
    function dispatchBeforeUnload(): boolean {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    }

    it('does not prevent navigation when the queue is idle', () => {
      const h = mountHarness();
      expect(dispatchBeforeUnload()).toBe(false);
      h.unmount();
    });

    it('prevents navigation while any item is queued or running', () => {
      const h = mountHarness();
      act(() => {
        h.queue.enqueue({
          label: 'in-flight',
          modelId: 'anthropic:claude-sonnet-4',
          file: fileFor('in-flight'),
        });
      });
      expect(dispatchBeforeUnload()).toBe(true);
      h.unmount();
    });

    it('stops preventing navigation once the queue drains', async () => {
      const h = mountHarness();
      act(() => {
        h.queue.enqueue({
          label: 'drains',
          modelId: 'anthropic:claude-sonnet-4',
          file: fileFor('drains'),
        });
      });
      await act(async () => {
        h.runs[0].resolve({ added: 1, skippedExisting: 0, rejectedRows: 0 });
      });
      // Still in queue showing 'complete' — the guard should drop here
      // already because nothing is queued or running anymore.
      expect(dispatchBeforeUnload()).toBe(false);

      await act(async () => {
        vi.advanceTimersByTime(AUTO_POP_DELAY_MS);
      });
      expect(dispatchBeforeUnload()).toBe(false);

      h.unmount();
    });
  });
});

/**
 * Review-flow tests. The runner here invokes the `onReview` callback the
 * queue hands it, so we can observe how the queue parks the item in the
 * `awaiting-review` status and surfaces it via `pendingReview`. Confirm
 * resolves the review promise so the runner can return its final
 * ImportResult; cancel resolves null, which production code (the real
 * orchestrator) turns into a thrown cancellation.
 */
type ReviewHarness = {
  readonly queue: ImportQueue;
  reviews: {
    rows: ReviewableContribution[];
    resolve: (rows: NormalizedContribution[] | null) => void;
  }[];
  runs: Deferred<ImportResult>[];
  unmount: () => void;
};

function mountReviewHarness(options: { cancelMode?: boolean } = {}): ReviewHarness {
  const reviews: ReviewHarness['reviews'] = [];
  const runs: Deferred<ImportResult>[] = [];
  const runImport: RunImport = async ({ onReview }) => {
    const result = defer<ImportResult>();
    runs.push(result);
    const reviewPromise = new Promise<NormalizedContribution[] | null>((resolve) => {
      reviews.push({ rows: [], resolve });
      // We invoke onReview with a single sample row that lacks a real
      // date — the tag from the orchestrator would normally set
      // autoDated:true; here we hand it directly.
      void onReview([
        {
          source: 'manual',
          category: 'other',
          signal: 'Shipped X',
          rawData: {},
          weight: 3,
          occurredAt: new Date('2026-01-15T00:00:00Z'),
          autoDated: true,
        },
      ]).then((r) => reviews[reviews.length - 1].resolve(r));
    });
    const reviewed = await reviewPromise;
    if (reviewed === null) throw new Error('cancelled');
    return result.promise;
  };

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  let queue: ImportQueue | null = null;
  function Capture() {
    queue = useImportQueue();
    return null;
  }
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <ImportQueueProvider runImport={runImport}>
          {children}
          <Capture />
        </ImportQueueProvider>
      </QueryClientProvider>
    );
  }
  const { unmount } = render(<Wrapper>{null}</Wrapper>);
  if (!queue) throw new Error('queue capture failed');
  void options.cancelMode; // currently unused; reserved for future test variants
  return {
    get queue() {
      return queue as ImportQueue;
    },
    reviews,
    runs,
    unmount,
  };
}

describe('<ImportQueueProvider> — review flow', () => {
  it('parks the row in awaiting-review and exposes pendingReview when the runner calls onReview', async () => {
    const h = mountReviewHarness();
    await act(async () => {
      h.queue.enqueue({
        label: 'q1',
        modelId: 'anthropic:claude-sonnet-4',
        file: new File(['hi'], 'q1.txt', { type: 'text/plain' }),
      });
    });

    expect(h.queue.pendingReview).not.toBeNull();
    expect(h.queue.pendingReview?.label).toBe('q1');
    expect(h.queue.pending[0].status).toBe('awaiting-review');
    expect(h.queue.pending).toHaveLength(1);

    h.unmount();
  });

  it('confirmReview resumes the runner and completes the import', async () => {
    const h = mountReviewHarness();
    await act(async () => {
      h.queue.enqueue({
        label: 'q1',
        modelId: 'anthropic:claude-sonnet-4',
        file: new File(['hi'], 'q1.txt', { type: 'text/plain' }),
      });
    });

    expect(h.queue.pendingReview).not.toBeNull();
    const id = h.queue.pendingReview!.id;
    await act(async () => {
      h.queue.confirmReview(id, [
        {
          source: 'manual',
          category: 'other',
          signal: 'Shipped X',
          rawData: {},
          weight: 3,
          occurredAt: new Date('2026-01-15T00:00:00Z'),
        },
      ]);
    });
    expect(h.queue.pending[0].status).toBe('running');
    expect(h.queue.pendingReview).toBeNull();

    await act(async () => {
      h.runs[0].resolve({ added: 1, skippedExisting: 0, rejectedRows: 0 });
    });
    expect(h.queue.pending[0].status).toBe('complete');
    expect(h.queue.pending[0].added).toBe(1);

    h.unmount();
  });

  it('cancelReview fails the row and clears pendingReview', async () => {
    const h = mountReviewHarness();
    await act(async () => {
      h.queue.enqueue({
        label: 'q1',
        modelId: 'anthropic:claude-sonnet-4',
        file: new File(['hi'], 'q1.txt', { type: 'text/plain' }),
      });
    });

    const id = h.queue.pendingReview!.id;
    await act(async () => {
      h.queue.cancelReview(id);
    });
    expect(h.queue.pending[0]).toMatchObject({ status: 'failed', error: 'cancelled' });
    expect(h.queue.pendingReview).toBeNull();

    h.unmount();
  });

  it('an awaiting-review item still counts toward the concurrency cap', async () => {
    const h = mountReviewHarness();
    await act(async () => {
      for (let i = 0; i < MAX_CONCURRENT_IMPORTS + 1; i += 1) {
        h.queue.enqueue({
          label: `b${i}`,
          modelId: 'anthropic:claude-sonnet-4',
          file: new File(['x'], `b${i}.txt`, { type: 'text/plain' }),
        });
      }
    });

    // Each of the MAX_CONCURRENT_IMPORTS busy items is sitting in
    // awaiting-review — none have been confirmed yet. The (MAX+1)th
    // item should still be queued.
    const awaiting = h.queue.pending.filter((p) => p.status === 'awaiting-review').length;
    const queued = h.queue.pending.filter((p) => p.status === 'queued').length;
    expect(awaiting).toBe(MAX_CONCURRENT_IMPORTS);
    expect(queued).toBe(1);

    h.unmount();
  });

  it('only one pendingReview is exposed at a time (FIFO) when multiple imports complete extraction', async () => {
    const h = mountReviewHarness();
    await act(async () => {
      for (let i = 0; i < 2; i += 1) {
        h.queue.enqueue({
          label: `b${i}`,
          modelId: 'anthropic:claude-sonnet-4',
          file: new File(['x'], `b${i}.txt`, { type: 'text/plain' }),
        });
      }
    });

    // Both extracted; one review surfaced. The other waits.
    expect(h.queue.pendingReview?.label).toBe('b0');

    const first = h.queue.pendingReview!.id;
    await act(async () => {
      h.queue.confirmReview(first, []);
    });
    await act(async () => {
      h.runs[0].resolve({ added: 0, skippedExisting: 0, rejectedRows: 0 });
    });

    expect(h.queue.pendingReview?.label).toBe('b1');

    h.unmount();
  });
});
