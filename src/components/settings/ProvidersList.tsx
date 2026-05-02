'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { hasActiveKey } from '@/lib/local-store/crypto';
import { listIdentities, type StoredIdentity } from '@/lib/local-store/identities';
import { db } from '@/lib/local-store/db';
import { SyncControls } from './SyncControls';

type IdentityRow = StoredIdentity & {
  lastSyncAt: number | null;
  lastError: string | null;
};

async function loadIdentitiesWithState(): Promise<IdentityRow[]> {
  if (!hasActiveKey()) return [];
  const identities = await listIdentities();
  const states = await db().syncState.toArray();
  const byIdentity = new Map(states.map((s) => [s.identityId, s]));
  return identities.map((i) => {
    const s = byIdentity.get(i.id);
    return {
      ...i,
      lastSyncAt: s?.lastSyncAt ?? null,
      lastError: s?.lastError ?? null,
    };
  });
}

function formatRelative(ts: number | null): string {
  if (!ts) return 'never';
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export function ProvidersList() {
  const identities = useLiveQuery(loadIdentitiesWithState, [], [] as IdentityRow[]);

  if (!identities || identities.length === 0) {
    return (
      <section className="rounded-[28px] border border-[color:var(--border)] bg-[color:var(--surface)]/78 p-6">
        <p className="text-xs uppercase tracking-[0.32em] text-[color:var(--muted)]">Connected providers</p>
        <p className="mt-3 text-sm text-[color:var(--muted)]">
          No providers connected yet. Add one to import contribution events from
          GitLab and other sources.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-[28px] border border-[color:var(--border)] bg-[color:var(--surface)]/78 p-6">
      <p className="text-xs uppercase tracking-[0.32em] text-[color:var(--muted)]">Connected providers</p>
      <ul className="mt-4 grid gap-4">
        {identities.map((identity) => (
          <li
            key={identity.id}
            data-testid={`identity-${identity.id}`}
            className="rounded-[22px] border border-white/10 bg-black/20 p-4"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-[color:var(--muted)]">
                  {identity.providerId}
                </p>
                <p className="mt-1 font-display text-xl text-[color:var(--foreground)]">
                  {identity.displayName ?? identity.username ?? identity.externalUserId}
                </p>
                <p className="text-xs text-[color:var(--muted)]">{identity.instanceUrl}</p>
              </div>
              <div className="text-right text-xs text-[color:var(--muted)]">
                <p>Last sync: {formatRelative(identity.lastSyncAt)}</p>
                {identity.lastError ? (
                  <p className="text-[rgb(255,193,168)]">{identity.lastError}</p>
                ) : null}
              </div>
            </div>
            <div className="mt-3">
              <SyncControls identityId={identity.id} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
