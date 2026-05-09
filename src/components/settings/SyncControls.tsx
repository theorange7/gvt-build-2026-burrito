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

const btnBase: React.CSSProperties = {
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: 11,
  letterSpacing: '0.08em',
  border: '2px solid #0A0A0A',
  borderRadius: 50,
  padding: '6px 16px',
  cursor: 'pointer',
  background: '#FBF5E5',
  color: '#0A0A0A',
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
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button
          type="button"
          onClick={() => sync.mutate()}
          disabled={sync.isPending}
          style={{
            ...btnBase,
            background: '#FF4D2E',
            color: '#FFF4DE',
            opacity: sync.isPending ? 0.6 : 1,
            cursor: sync.isPending ? 'not-allowed' : 'pointer',
          }}
        >
          {sync.isPending ? 'Syncing…' : 'Sync now'}
        </button>
        <button
          type="button"
          onClick={() => setShowBackfill((s) => !s)}
          style={btnBase}
        >
          {showBackfill ? 'Close backfill' : 'Backfill range…'}
        </button>
        <button
          type="button"
          onClick={() => disconnect.mutate(false)}
          disabled={disconnect.isPending}
          style={{
            ...btnBase,
            opacity: disconnect.isPending ? 0.6 : 1,
            cursor: disconnect.isPending ? 'not-allowed' : 'pointer',
          }}
        >
          Disconnect
        </button>
        <button
          type="button"
          onClick={() => disconnect.mutate(true)}
          disabled={disconnect.isPending}
          style={{
            ...btnBase,
            background: '#0A0A0A',
            color: '#FFF4DE',
            opacity: disconnect.isPending ? 0.6 : 1,
            cursor: disconnect.isPending ? 'not-allowed' : 'pointer',
          }}
        >
          Disconnect &amp; forget data
        </button>
      </div>
      {sync.isError ? (
        <p
          role="alert"
          style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#FF4D2E' }}
        >
          {sync.error instanceof Error ? sync.error.message : 'Sync failed.'}
        </p>
      ) : null}
      {sync.isSuccess && sync.data ? (
        <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#0A0A0A', opacity: 0.55 }}>
          Last sync: +{sync.data.added} new, {sync.data.skippedExisting} skipped.
        </p>
      ) : null}
      {showBackfill ? (
        <BackfillRangePicker identityId={identityId} onClose={() => setShowBackfill(false)} />
      ) : null}
    </div>
  );
}
