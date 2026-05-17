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
  type RunImport,
  useImportQueue,
} from '@/components/dashboard/ImportQueueContext';

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
