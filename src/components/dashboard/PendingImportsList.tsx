'use client';

/*
 * Renders the in-flight file-upload queue under the timeline action
 * buttons. One row per pending import; rows pop on success (after a
 * short delay so the user sees the "✓ done" state). Failed rows show
 * the error and auto-pop on the same delay.
 */
import { friendlyImportError } from './importErrorMessages';
import { useImportQueue, type PendingImport } from './ImportQueueContext';

type Palette = {
  ink: string;
  cream: string;
  paper: string;
  hot: string;
  lime: string;
  accent: string;
  accent2: string;
};

const STATUS_LABEL: Record<PendingImport['status'], string> = {
  queued: 'waiting…',
  running: 'extracting…',
  complete: '✓ done',
  failed: 'failed',
};

function statusColor(status: PendingImport['status'], p: Palette): string {
  if (status === 'complete') return p.lime;
  if (status === 'failed') return p.hot;
  return p.accent;
}

export function PendingImportsList({ p }: { p: Palette }) {
  const { pending } = useImportQueue();
  if (pending.length === 0) return null;

  return (
    <div
      data-testid="pending-imports-list"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      {pending.map((item) => {
        const tone = statusColor(item.status, p);
        return (
          <div
            key={item.id}
            data-testid="pending-import-row"
            data-status={item.status}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: '#fff', border: '2px solid ' + p.ink, borderRadius: 10,
              padding: '8px 12px', boxShadow: '2px 2px 0 ' + p.ink,
              fontFamily: 'Space Grotesk, sans-serif', fontSize: 13, color: p.ink,
            }}
          >
            <span
              aria-hidden
              style={{
                width: 8, height: 8, borderRadius: 999,
                background: tone, flexShrink: 0,
                animation: item.status === 'running' || item.status === 'queued'
                  ? 'pulse 1.4s ease-in-out infinite'
                  : 'none',
              }}
            />
            <span style={{
              flex: 1, minWidth: 0, overflow: 'hidden',
              textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600,
            }}>
              {item.label}
            </span>
            <span style={{
              fontFamily: 'JetBrains Mono, monospace', fontSize: 10,
              color: tone, letterSpacing: '0.08em', flexShrink: 0,
            }}>
              {item.status === 'failed' && item.error
                ? `failed · ${friendlyImportError(item.error)}`
                : STATUS_LABEL[item.status]}
              {item.status === 'complete' && typeof item.added === 'number'
                ? ` · +${item.added}`
                : ''}
            </span>
          </div>
        );
      })}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}
