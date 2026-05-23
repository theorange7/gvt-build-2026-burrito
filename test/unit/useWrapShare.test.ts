/**
 * Tests for `useWrapShare` — the small dashboard hook that owns share-link
 * hydration, the copy indicator, and the revoke side-effect. Extracted from
 * DashboardShell in spec-31 follow-up cleanup so the contract is testable
 * without rendering the 1000-line shell.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

vi.mock('@/lib/local-store/wraps', () => ({
  listWrapShares: vi.fn(),
  updateWrapShare: vi.fn(),
}));

vi.mock('@/lib/ai/share', () => ({
  revokeShare: vi.fn(),
}));

import { useWrapShare } from '@/components/dashboard/useWrapShare';
import { listWrapShares, updateWrapShare } from '@/lib/local-store/wraps';
import { revokeShare } from '@/lib/ai/share';

const mockListWrapShares = listWrapShares as ReturnType<typeof vi.fn>;
const mockUpdateWrapShare = updateWrapShare as ReturnType<typeof vi.fn>;
const mockRevokeShare = revokeShare as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockListWrapShares.mockReset();
  mockUpdateWrapShare.mockReset().mockResolvedValue(undefined);
  mockRevokeShare.mockReset();
  // happy-dom doesn't ship navigator.clipboard out of the box.
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    configurable: true,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useWrapShare — hydration', () => {
  it('hydrates the shares map from listWrapShares() on mount', async () => {
    mockListWrapShares.mockResolvedValue({
      'wrap-1': { shareSlug: 'aaaaBBBBccccDDDDeeeeFF', shareUrl: 'https://example.test/aaaaBBBBccccDDDDeeeeFF/index.html' },
    });

    const { result } = renderHook(() => useWrapShare());

    await waitFor(() => {
      expect(Object.keys(result.current.shares)).toEqual(['wrap-1']);
    });
    expect(result.current.shares['wrap-1'].shareSlug).toBe('aaaaBBBBccccDDDDeeeeFF');
  });

  it('falls back to an empty map when listWrapShares() rejects (e.g. store locked)', async () => {
    mockListWrapShares.mockRejectedValue(new Error('store-locked'));

    const { result } = renderHook(() => useWrapShare());

    await waitFor(() => {
      expect(mockListWrapShares).toHaveBeenCalled();
    });
    expect(result.current.shares).toEqual({});
  });
});

describe('useWrapShare — copyShareLink', () => {
  it('writes to the clipboard and pins copiedId for ~1.8s', async () => {
    vi.useFakeTimers();
    mockListWrapShares.mockResolvedValue({});
    const { result } = renderHook(() => useWrapShare());

    await act(async () => {
      await result.current.copyShareLink('wrap-1', 'https://example.test/x/index.html');
    });

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      'https://example.test/x/index.html',
    );
    expect(result.current.copiedId).toBe('wrap-1');

    // Indicator auto-clears after the timer fires.
    await act(async () => {
      vi.advanceTimersByTime(1800);
    });
    expect(result.current.copiedId).toBeNull();
  });

  it('silently no-ops if the clipboard write fails (permission, http://, focus loss)', async () => {
    mockListWrapShares.mockResolvedValue({});
    (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('NotAllowedError'),
    );
    const { result } = renderHook(() => useWrapShare());

    await act(async () => {
      await result.current.copyShareLink('wrap-1', 'https://example.test/x/index.html');
    });

    // No throw, no copied indicator — same as a successful blocked-clipboard
    // path; the user can retry. This is intentional: the controls stay live
    // so failure doesn't lock the user out of their own action.
    expect(result.current.copiedId).toBeNull();
  });

  it('does not clobber a newer copy with a stale timer-clear', async () => {
    vi.useFakeTimers();
    mockListWrapShares.mockResolvedValue({});
    const { result } = renderHook(() => useWrapShare());

    await act(async () => {
      await result.current.copyShareLink('wrap-1', 'url-1');
    });
    expect(result.current.copiedId).toBe('wrap-1');

    // Advance partway, then copy a second wrap. The first wrap's timer is
    // still scheduled — when it fires, the guard `id === wrapId` must keep
    // wrap-2's indicator intact rather than clearing it back to null.
    await act(async () => {
      vi.advanceTimersByTime(900);
      await result.current.copyShareLink('wrap-2', 'url-2');
    });
    expect(result.current.copiedId).toBe('wrap-2');

    // Fire wrap-1's stale timer. wrap-2 must survive.
    await act(async () => {
      vi.advanceTimersByTime(900);
    });
    expect(result.current.copiedId).toBe('wrap-2');
  });
});

describe('useWrapShare — stopSharing', () => {
  it('on `ok`: clears the share locally and removes from the map', async () => {
    mockListWrapShares.mockResolvedValue({
      'wrap-1': { shareSlug: 'aaaaBBBBccccDDDDeeeeFF', shareUrl: 'https://example.test/x' },
    });
    mockRevokeShare.mockResolvedValue('ok');
    const { result } = renderHook(() => useWrapShare());

    await waitFor(() => expect(result.current.shares['wrap-1']).toBeDefined());

    await act(async () => {
      await result.current.stopSharing('wrap-1', 'aaaaBBBBccccDDDDeeeeFF');
    });

    expect(mockRevokeShare).toHaveBeenCalledWith('aaaaBBBBccccDDDDeeeeFF');
    expect(mockUpdateWrapShare).toHaveBeenCalledWith('wrap-1', {});
    expect(result.current.shares['wrap-1']).toBeUndefined();
    expect(result.current.revokingId).toBeNull();
  });

  it('on `not-found`: still scrubs the local share (server already lost the row)', async () => {
    mockListWrapShares.mockResolvedValue({
      'wrap-1': { shareSlug: 'aaaaBBBBccccDDDDeeeeFF', shareUrl: 'https://example.test/x' },
    });
    mockRevokeShare.mockResolvedValue('not-found');
    const { result } = renderHook(() => useWrapShare());

    await waitFor(() => expect(result.current.shares['wrap-1']).toBeDefined());

    await act(async () => {
      await result.current.stopSharing('wrap-1', 'aaaaBBBBccccDDDDeeeeFF');
    });

    // The server lost the row (e.g. a parallel-tab revoke). The user's intent
    // — "this should not be shareable" — is satisfied; clear the local copy.
    expect(mockUpdateWrapShare).toHaveBeenCalledWith('wrap-1', {});
    expect(result.current.shares['wrap-1']).toBeUndefined();
  });

  it('on `forbidden`: keeps the local share in place so the card stays actionable', async () => {
    mockListWrapShares.mockResolvedValue({
      'wrap-1': { shareSlug: 'aaaaBBBBccccDDDDeeeeFF', shareUrl: 'https://example.test/x' },
    });
    mockRevokeShare.mockResolvedValue('forbidden');
    const { result } = renderHook(() => useWrapShare());

    await waitFor(() => expect(result.current.shares['wrap-1']).toBeDefined());

    await act(async () => {
      await result.current.stopSharing('wrap-1', 'aaaaBBBBccccDDDDeeeeFF');
    });

    // 403 means the server thinks this install doesn't own the slug. Leaving
    // the local copy in place keeps the controls visible so the user (or a
    // future support flow) can investigate; scrubbing them would orphan the
    // UI from a still-published bundle.
    expect(mockUpdateWrapShare).not.toHaveBeenCalled();
    expect(result.current.shares['wrap-1']).toBeDefined();
    expect(result.current.revokingId).toBeNull();
  });

  it('sets revokingId during the in-flight call and clears it in `finally`', async () => {
    mockListWrapShares.mockResolvedValue({
      'wrap-1': { shareSlug: 'aaaaBBBBccccDDDDeeeeFF', shareUrl: 'https://example.test/x' },
    });
    let resolveRevoke: (v: 'ok') => void = () => undefined;
    mockRevokeShare.mockImplementation(
      () => new Promise<'ok'>((resolve) => { resolveRevoke = resolve; }),
    );

    const { result } = renderHook(() => useWrapShare());
    await waitFor(() => expect(result.current.shares['wrap-1']).toBeDefined());

    let stopPromise!: Promise<void>;
    act(() => {
      stopPromise = result.current.stopSharing('wrap-1', 'aaaaBBBBccccDDDDeeeeFF');
    });
    await waitFor(() => expect(result.current.revokingId).toBe('wrap-1'));

    await act(async () => {
      resolveRevoke('ok');
      await stopPromise;
    });
    expect(result.current.revokingId).toBeNull();
  });

  it('clears revokingId even when revokeShare throws', async () => {
    mockListWrapShares.mockResolvedValue({
      'wrap-1': { shareSlug: 'aaaaBBBBccccDDDDeeeeFF', shareUrl: 'https://example.test/x' },
    });
    mockRevokeShare.mockRejectedValue(new Error('network down'));
    const { result } = renderHook(() => useWrapShare());
    await waitFor(() => expect(result.current.shares['wrap-1']).toBeDefined());

    await act(async () => {
      await result.current.stopSharing('wrap-1', 'aaaaBBBBccccDDDDeeeeFF');
    });

    // Card must come out of the "Revoking…" state so the user can retry.
    expect(result.current.revokingId).toBeNull();
    expect(mockUpdateWrapShare).not.toHaveBeenCalled();
    expect(result.current.shares['wrap-1']).toBeDefined();
  });
});
