/**
 * Tests for spec 1: usePendingWrap paused-locked behavior.
 *
 * Verifies that the hook does NOT call pollWrap while the encryption key is
 * absent, instead entering `paused-locked`, and that it resumes polling
 * immediately on the `wrapped:unlocked` custom event.
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePendingWrap } from '@/lib/local-store/hooks';
import { addPendingWrap } from '@/lib/local-store/pendingWraps';
import { deriveKey, generateSalt, lock, setActiveKey } from '@/lib/local-store/crypto';

// Mock the AI layer so tests don't need a running backend
vi.mock('@/lib/ai/generate', () => ({
  pollWrap: vi.fn(),
  enqueueWrap: vi.fn(),
}));

// Mock saveWrap so 'complete' path doesn't need encryption in every test
vi.mock('@/lib/local-store/wraps', () => ({
  saveWrap: vi.fn().mockResolvedValue(undefined),
  getWrap: vi.fn(),
}));

import { pollWrap } from '@/lib/ai/generate';

async function activateKey(): Promise<void> {
  const salt = generateSalt();
  const key = await deriveKey('test-pass-phrase!1', salt);
  setActiveKey(key);
}

async function seedJob(id: string): Promise<void> {
  await addPendingWrap({
    id,
    mode: 'snapshot',
    windowStart: new Date('2025-04-01'),
    windowEnd: new Date('2025-06-30'),
    requestedAt: new Date(),
    status: 'queued',
    busy: false,
    modelId: 'test-model',
  });
}

describe('usePendingWrap — paused-locked phase', () => {
  beforeEach(() => {
    vi.mocked(pollWrap).mockReset();
  });

  it('enters paused-locked and never calls pollWrap when the store is locked at mount', async () => {
    // global afterEach calls lock() so key is already gone
    const jobId = crypto.randomUUID();
    await seedJob(jobId);

    const { result } = renderHook(() => usePendingWrap(jobId));

    await waitFor(() => {
      expect(result.current.phase).toBe('paused-locked');
    });

    expect(pollWrap).not.toHaveBeenCalled();
  });

  it('resumes polling immediately after wrapped:unlocked fires and reflects the server state', async () => {
    const jobId = crypto.randomUUID();
    await seedJob(jobId);

    vi.mocked(pollWrap).mockResolvedValue({ status: 'running', busy: false });

    const { result } = renderHook(() => usePendingWrap(jobId));

    // Without a key the hook must pause
    await waitFor(() => expect(result.current.phase).toBe('paused-locked'));
    expect(pollWrap).not.toHaveBeenCalled();

    // Simulate user unlocking the store and the gate dispatching the event
    await act(async () => {
      await activateKey();
      window.dispatchEvent(new CustomEvent('wrapped:unlocked'));
    });

    // The next tick should poll and surface the running state
    await waitFor(() => expect(result.current.phase).toBe('running'));
    expect(pollWrap).toHaveBeenCalledWith(jobId);
  });

  it('does not call pollWrap for the tick that fires while locked, then polls after unlock', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    const jobId = crypto.randomUUID();
    await activateKey();
    await seedJob(jobId);

    let callCount = 0;
    vi.mocked(pollWrap).mockImplementation(async () => {
      callCount += 1;
      if (callCount === 1) return { status: 'running', busy: false };
      return { status: 'complete', sliceContent: {} as never };
    });

    const { result } = renderHook(() => usePendingWrap(jobId));

    // First poll with key active → running
    await waitFor(() => expect(result.current.phase).toBe('running'));
    expect(callCount).toBe(1);

    // Simulate idle-lock clearing the key between ticks
    act(() => { lock(); });

    // Advance past BACKOFF_MS[0] = 2000ms so the scheduled next tick fires
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });

    // The hook must have paused without polling again
    await waitFor(() => expect(result.current.phase).toBe('paused-locked'));
    expect(callCount).toBe(1); // no additional poll made while locked

    vi.useRealTimers();

    // Unlock and resume
    await act(async () => {
      await activateKey();
      window.dispatchEvent(new CustomEvent('wrapped:unlocked'));
    });

    await waitFor(() => expect(result.current.phase).toBe('complete'), { timeout: 5000 });
    expect(callCount).toBe(2);
  });

  it('does not poll after unmount even if wrapped:unlocked fires', async () => {
    const jobId = crypto.randomUUID();
    await seedJob(jobId);

    vi.mocked(pollWrap).mockResolvedValue({ status: 'running', busy: false });

    const { result, unmount } = renderHook(() => usePendingWrap(jobId));

    await waitFor(() => expect(result.current.phase).toBe('paused-locked'));

    unmount();

    await act(async () => {
      await activateKey();
      window.dispatchEvent(new CustomEvent('wrapped:unlocked'));
    });

    // Give microtasks a chance to run
    await new Promise<void>((r) => setTimeout(r, 50));

    expect(pollWrap).not.toHaveBeenCalled();
  });
});
