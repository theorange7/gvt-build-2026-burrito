import { useCallback, useEffect, useState } from 'react';
import { listWrapShares, updateWrapShare } from '@/lib/local-store/wraps';
import { revokeShare } from '@/lib/ai/share';

/**
 * Wrap id → share metadata for every wrap that currently has a published
 * share link. Empty until the encrypted local store has been read.
 */
export type ShareMap = Record<string, { shareSlug: string; shareUrl: string }>;

const COPIED_INDICATOR_MS = 1800;

/**
 * Encapsulates the small state machine and side-effects the dashboard needs
 * to render share controls on each wrap card:
 *
 *  - `shares`     — hydrated once on mount from the encrypted local store
 *                   (`listWrapShares` requires the unlock key to be active).
 *  - `copiedId`   — flips on briefly after a clipboard copy so a button can
 *                   read "Copied" for ~1.8s without the parent owning a timer.
 *  - `revokingId` — set while a revoke call is in flight so the same wrap
 *                   can't be double-revoked from a duplicate click.
 *
 * Lifted out of `DashboardShell` so the share contract is testable in
 * isolation: a `renderHook` against mocked `listWrapShares` / `updateWrapShare`
 * / `revokeShare` modules covers it without rendering 1000+ lines of
 * dashboard chrome. The hook intentionally swallows failures — the share
 * controls stay visible so the user can retry from the same affordance.
 */
export function useWrapShare(): {
  shares: ShareMap;
  copiedId: string | null;
  revokingId: string | null;
  copyShareLink: (wrapId: string, url: string) => Promise<void>;
  stopSharing: (wrapId: string, slug: string) => Promise<void>;
} {
  const [shares, setShares] = useState<ShareMap>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  useEffect(() => {
    listWrapShares()
      .then(setShares)
      .catch(() => setShares({}));
  }, []);

  const copyShareLink = useCallback(async (wrapId: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(wrapId);
      // Auto-clear the indicator after a short window so it doesn't pin if
      // the user navigates away. The functional-update guard avoids clobbering
      // a later copy of a different wrap that fired between this set and the
      // timer firing.
      window.setTimeout(
        () => setCopiedId((id) => (id === wrapId ? null : id)),
        COPIED_INDICATOR_MS,
      );
    } catch {
      /* clipboard blocked (permissions, http://, focus loss); silent no-op */
    }
  }, []);

  const stopSharing = useCallback(async (wrapId: string, slug: string) => {
    setRevokingId(wrapId);
    try {
      const result = await revokeShare(slug);
      // `not-found` is treated as success: the server already lost the row
      // (e.g. a parallel revoke from another tab), and the user's intent —
      // "this should not be shareable" — is satisfied either way. The local
      // share metadata still needs scrubbing so the card returns to the
      // un-shared state.
      if (result === 'ok' || result === 'not-found') {
        await updateWrapShare(wrapId, {});
        setShares((prev) => {
          const next = { ...prev };
          delete next[wrapId];
          return next;
        });
      }
    } catch {
      /* surface nothing — the card keeps its controls so the user can retry */
    } finally {
      setRevokingId(null);
    }
  }, []);

  return { shares, copiedId, revokingId, copyShareLink, stopSharing };
}
