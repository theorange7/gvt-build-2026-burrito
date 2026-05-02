'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  disconnectIdentity,
  syncIdentity,
} from '@/lib/providers/orchestrator';
import { BackfillRangePicker } from './BackfillRangePicker';

type SyncControlsProps = {
  identityId: string;
};

export function SyncControls({ identityId }: SyncControlsProps) {
  const queryClient = useQueryClient();
  const [showBackfill, setShowBackfill] = useState(false);

  const sync = useMutation({
    mutationFn: async () => syncIdentity(identityId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contributions'] });
      queryClient.invalidateQueries({ queryKey: ['identities'] });
    },
  });

  const disconnect = useMutation({
    mutationFn: async (deleteContributions: boolean) =>
      disconnectIdentity(identityId, { deleteContributions }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contributions'] });
      queryClient.invalidateQueries({ queryKey: ['identities'] });
    },
  });

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => sync.mutate()}
          disabled={sync.isPending}
          className="rounded-full border border-white/10 px-4 py-2 text-xs text-[color:var(--foreground)] hover:border-[color:var(--accent)] disabled:opacity-60"
        >
          {sync.isPending ? 'Syncing…' : 'Sync now'}
        </button>
        <button
          type="button"
          onClick={() => setShowBackfill((s) => !s)}
          className="rounded-full border border-white/10 px-4 py-2 text-xs text-[color:var(--foreground)] hover:border-[color:var(--accent)]"
        >
          {showBackfill ? 'Close backfill' : 'Backfill range…'}
        </button>
        <button
          type="button"
          onClick={() => disconnect.mutate(false)}
          disabled={disconnect.isPending}
          className="rounded-full border border-white/10 px-4 py-2 text-xs text-[color:var(--muted)] hover:border-[color:var(--accent)] hover:text-[color:var(--foreground)] disabled:opacity-60"
        >
          Disconnect
        </button>
        <button
          type="button"
          onClick={() => disconnect.mutate(true)}
          disabled={disconnect.isPending}
          className="rounded-full border border-white/10 px-4 py-2 text-xs text-[rgb(255,193,168)] hover:border-[rgb(255,193,168)] disabled:opacity-60"
        >
          Disconnect & forget data
        </button>
      </div>
      {sync.isError ? (
        <p role="alert" className="text-xs text-[rgb(255,193,168)]">
          {sync.error instanceof Error ? sync.error.message : 'Sync failed.'}
        </p>
      ) : null}
      {sync.isSuccess && sync.data ? (
        <p className="text-xs text-[color:var(--muted)]">
          Last sync: +{sync.data.added} new, {sync.data.skippedExisting} skipped.
        </p>
      ) : null}
      {showBackfill ? (
        <BackfillRangePicker identityId={identityId} onClose={() => setShowBackfill(false)} />
      ) : null}
    </div>
  );
}
