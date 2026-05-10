/**
 * Tests for the idle-lock–aware polling behaviour added in spec 01.
 *
 * Strategy: vi.mock the four modules that usePendingWrap touches so we can
 * control hasActiveKey(), getPendingWrap(), pollWrap(), saveWrap(), and
 * removePendingWrap() independently, then use renderHook + fake timers to
 * drive the effect loop.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// --- module mocks (hoisted before imports resolve) --------------------------

vi.mock('@/lib/local-store/crypto', () => ({
  hasActiveKey: vi.fn(),
}));

vi.mock('@/lib/local-store/pendingWraps', () => ({
  getPendingWrap: vi.fn(),
  removePendingWrap: vi.fn(),
  updatePendingWrap: vi.fn(),
}));

vi.mock('@/lib/ai/generate', () => ({
  pollWrap: vi.fn(),
}));

vi.mock('@/lib/local-store/wraps', () => ({
  saveWrap: vi.fn(),
}));

// --- import after mocks so the hook gets the mocked versions ----------------

import { usePendingWrap } from '@/lib/local-store/hooks';
import { hasActiveKey } from '@/lib/local-store/crypto';
import { getPendingWrap, removePendingWrap, updatePendingWrap } from '@/lib/local-store/pendingWraps';
import { pollWrap } from '@/lib/ai/generate';
import { saveWrap } from '@/lib/local-store/wraps';
import type { PendingWrap } from '@/lib/local-store/pendingWraps';
import type { SliceContent } from '@/lib/types';

// typed helpers for mocks
const mockHasActiveKey = hasActiveKey as ReturnType<typeof vi.fn>;
const mockGetPendingWrap = getPendingWrap as ReturnType<typeof vi.fn>;
const mockRemovePendingWrap = removePendingWrap as ReturnType<typeof vi.fn>;
const mockUpdatePendingWrap = updatePendingWrap as ReturnType<typeof vi.fn>;
const mockPollWrap = pollWrap as ReturnType<typeof vi.fn>;
const mockSaveWrap = saveWrap as ReturnType<typeof vi.fn>;

// A reusable pending-wrap fixture
function makePending(overrides?: Partial<PendingWrap>): PendingWrap {
  return {
    id: 'job-abc',
    mode: 'year-end',
    windowStart: new Date('2025-01-01'),
    windowEnd: new Date('2025-12-31'),
    requestedAt: new Date('2025-12-31T20:00:00Z'),
    status: 'running',
    busy: true,
    ...overrides,
  };
}

const SAMPLE_SLICES: SliceContent[] = [
  { sliceKey: 'velocity', headline: 'Solid throughput.', body: 'PRs merged steadily.' },
];

// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.useFakeTimers();
  // Reset every mock to a clean no-op state before each test
  mockHasActiveKey.mockReset();
  mockGetPendingWrap.mockReset();
  mockRemovePendingWrap.mockReset().mockResolvedValue(undefined);
  mockUpdatePendingWrap.mockReset().mockResolvedValue(undefined);
  mockPollWrap.mockReset();
  mockSaveWrap.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------

describe('usePendingWrap — idle-lock behaviour (spec 01)', () => {
  /**
   * Test 1: when the store is locked, tick() must NOT call pollWrap and
   * the hook must land in 'paused-locked'.
   */
  it('does not fetch and enters paused-locked phase when store is locked', async () => {
    mockHasActiveKey.mockReturnValue(false);
    mockGetPendingWrap.mockResolvedValue(makePending());

    const { result } = renderHook(() => usePendingWrap('job-abc'));

    // Let the first microtask queue drain (tick() runs synchronously inside
    // the effect but awaits nothing before the hasActiveKey() guard).
    await act(async () => {
      await vi.runAllMicrotasksAsync();
    });

    expect(mockPollWrap).not.toHaveBeenCalled();
    expect(result.current.phase).toBe('paused-locked');
  });

  /**
   * Test 2: after pausing, dispatching 'store-unlocked' on window must
   * trigger a fetch and transition the phase out of 'paused-locked'.
   */
  it('resumes polling and transitions out of paused-locked after store-unlocked event', async () => {
    // First call: locked; subsequent calls: unlocked
    mockHasActiveKey.mockReturnValueOnce(false).mockReturnValue(true);
    mockGetPendingWrap.mockResolvedValue(makePending());
    mockPollWrap.mockResolvedValue({ status: 'running', busy: false });

    const { result } = renderHook(() => usePendingWrap('job-abc'));

    // Let the initial locked tick complete
    await act(async () => {
      await vi.runAllMicrotasksAsync();
    });

    expect(result.current.phase).toBe('paused-locked');
    expect(mockPollWrap).not.toHaveBeenCalled();

    // Simulate unlock event — the hook registered a one-shot listener
    await act(async () => {
      window.dispatchEvent(new CustomEvent('store-unlocked'));
      await vi.runAllMicrotasksAsync();
    });

    // pollWrap should have been called exactly once after the unlock event
    expect(mockPollWrap).toHaveBeenCalledTimes(1);
    // Phase must no longer be paused-locked
    expect(result.current.phase).not.toBe('paused-locked');
  });

  /**
   * Test 3 (canary): if saveWrap throws after a 'complete' response, the
   * hook must NOT call removePendingWrap — the server result row is still
   * intact and the user can retry by unlocking the store again.
   */
  it('does not remove pending row when saveWrap throws after a complete response', async () => {
    mockHasActiveKey.mockReturnValue(true);
    mockGetPendingWrap.mockResolvedValue(makePending());
    mockPollWrap.mockResolvedValue({ status: 'complete', sliceContent: SAMPLE_SLICES });
    mockSaveWrap.mockRejectedValue(new Error('store-locked'));

    const { result } = renderHook(() => usePendingWrap('job-abc'));

    await act(async () => {
      await vi.runAllMicrotasksAsync();
    });

    // removePendingWrap must NOT have been called — the server copy is preserved
    expect(mockRemovePendingWrap).not.toHaveBeenCalled();
    // The hook should surface the error
    expect(result.current.phase).toBe('failed');
  });

  /**
   * Test 4: confirm that no fetch is issued even after multiple timer
   * advances while the store remains locked.  This proxies the guarantee
   * that the server result row is never drained.
   */
  it('never calls pollWrap across multiple timer advances while store stays locked', async () => {
    mockHasActiveKey.mockReturnValue(false);
    mockGetPendingWrap.mockResolvedValue(makePending());

    renderHook(() => usePendingWrap('job-abc'));

    // First tick
    await act(async () => {
      await vi.runAllMicrotasksAsync();
    });

    // Advance through multiple backoff windows
    await act(async () => {
      vi.advanceTimersByTime(2000);
      await vi.runAllMicrotasksAsync();
    });

    await act(async () => {
      vi.advanceTimersByTime(4000);
      await vi.runAllMicrotasksAsync();
    });

    await act(async () => {
      vi.advanceTimersByTime(8000);
      await vi.runAllMicrotasksAsync();
    });

    // pollWrap must remain at zero — the server result row is untouched
    expect(mockPollWrap).toHaveBeenCalledTimes(0);
  });
});
