'use client';

import React from 'react';
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

const sectionStyle: React.CSSProperties = {
  background: '#FBF5E5',
  border: '2px solid #0A0A0A',
  boxShadow: '4px 4px 0 #0A0A0A',
  borderRadius: '20px',
  padding: '24px',
};

const monoLabelStyle: React.CSSProperties = {
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: '10px',
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  color: '#0A0A0A',
  opacity: 0.7,
};

export function ProvidersList() {
  const identities = useLiveQuery(loadIdentitiesWithState, [], [] as IdentityRow[]);

  if (!identities || identities.length === 0) {
    return (
      <section style={sectionStyle}>
        <p style={monoLabelStyle}>Connected providers</p>
        <p
          className="mt-3 text-sm"
          style={{
            fontFamily: "'Space Grotesk', sans-serif",
            color: '#0A0A0A',
            opacity: 0.65,
          }}
        >
          No providers connected yet. Add one to import contribution events from
          GitLab and other sources.
        </p>
      </section>
    );
  }

  return (
    <section style={sectionStyle}>
      <p style={monoLabelStyle}>Connected providers</p>
      <ul className="mt-4 grid gap-4">
        {identities.map((identity) => (
          <li
            key={identity.id}
            data-testid={`identity-${identity.id}`}
            style={{
              background: '#ffffff',
              border: '2px solid #0A0A0A',
              boxShadow: '3px 3px 0 #0A0A0A',
              borderRadius: '14px',
              padding: '16px',
            }}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div>
                <span
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: '9px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.12em',
                    background: '#C6FF3B',
                    border: '1px solid #0A0A0A',
                    borderRadius: '50px',
                    padding: '2px 8px',
                    color: '#0A0A0A',
                    display: 'inline-block',
                  }}
                >
                  {identity.providerId}
                </span>
                <p
                  className="mt-2"
                  style={{
                    fontFamily: "'Space Grotesk', sans-serif",
                    fontSize: '1.2rem',
                    fontWeight: 700,
                    color: '#0A0A0A',
                  }}
                >
                  {identity.displayName ?? identity.username ?? identity.externalUserId}
                </p>
                <p
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: '11px',
                    color: '#0A0A0A',
                    opacity: 0.55,
                  }}
                >
                  {identity.instanceUrl}
                </p>
              </div>
              <div className="text-right">
                <p
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: '10px',
                    color: '#0A0A0A',
                    opacity: 0.55,
                  }}
                >
                  Last sync: {formatRelative(identity.lastSyncAt)}
                </p>
                {identity.lastError ? (
                  <p
                    style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: '10px',
                      color: '#FF4D2E',
                    }}
                  >
                    {identity.lastError}
                  </p>
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
