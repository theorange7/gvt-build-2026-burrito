'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { resetLocalState, type ResetMode, type ResetResult } from '@/lib/local-store/reset';

const INK = '#0A0A0A';
const HOT = '#FF4D2E';

interface ResetModalProps {
  open: boolean;
  onClose: () => void;
  initialMode?: ResetMode;
}

export function ResetModal({ open, onClose, initialMode = 'clear-data' }: ResetModalProps) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<ResetMode>(initialMode);
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offlineResult, setOfflineResult] = useState<ResetResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setMode(initialMode);
      setConfirmText('');
      setError(null);
      setOfflineResult(null);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open, initialMode]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const canConfirm = confirmText === 'RESET' && !busy;

  const executeReset = useCallback(
    async (proceedLocalOnly?: boolean) => {
      setBusy(true);
      setError(null);
      setOfflineResult(null);
      try {
        const result = await resetLocalState(mode, proceedLocalOnly ? { proceedLocalOnly: true } : undefined);

        if (result.serverCleanup === 'offline' && mode === 'clear-data') {
          setError('Could not reach server. Your local data has not been cleared. Check your connection and try again.');
          setBusy(false);
          return;
        }

        if (result.serverCleanup === 'offline' && mode === 'forget-device' && !proceedLocalOnly) {
          setOfflineResult(result);
          setBusy(false);
          return;
        }

        if (result.serverCleanup === 'partial' && mode === 'clear-data') {
          const names = result.failedResources?.join(', ') ?? 'some resources';
          setError(
            `Server cleanup partially failed (${names}). Your local data has been cleared. Retry to clean up remaining server data.`,
          );
          setBusy(false);
          queryClient.invalidateQueries({ queryKey: ['contributions'] });
          queryClient.invalidateQueries({ queryKey: ['wraps'] });
          queryClient.invalidateQueries({ queryKey: ['identities'] });
          queryClient.invalidateQueries({ queryKey: ['pendingWraps'] });
          return;
        }

        if (mode === 'forget-device') {
          window.location.reload();
          return;
        }

        // Mode A success
        queryClient.invalidateQueries({ queryKey: ['contributions'] });
        queryClient.invalidateQueries({ queryKey: ['wraps'] });
        queryClient.invalidateQueries({ queryKey: ['identities'] });
        queryClient.invalidateQueries({ queryKey: ['pendingWraps'] });
        onClose();
      } catch {
        setError('An unexpected error occurred. Please try again.');
        setBusy(false);
      }
    },
    [mode, queryClient, onClose],
  );

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(10,10,10,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 200,
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="reset-modal-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#FBF5E5',
          border: `2px solid ${INK}`,
          boxShadow: `6px 6px 0 ${INK}`,
          borderRadius: 20,
          padding: '28px 32px',
          maxWidth: 520,
          width: '100%',
          fontFamily: 'Space Grotesk, sans-serif',
        }}
      >
        <h2
          id="reset-modal-title"
          style={{ fontSize: 22, fontWeight: 700, color: INK, margin: '0 0 20px' }}
        >
          Reset this device
        </h2>

        {/* Mode selector */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
          <label
            style={{
              display: 'flex',
              gap: 12,
              cursor: 'pointer',
              padding: '12px 14px',
              border: `2px solid ${mode === 'clear-data' ? INK : '#ccc'}`,
              borderRadius: 12,
              background: mode === 'clear-data' ? '#fff' : 'transparent',
            }}
          >
            <input
              type="radio"
              name="reset-mode"
              checked={mode === 'clear-data'}
              onChange={() => setMode('clear-data')}
              style={{ marginTop: 2, flexShrink: 0 }}
            />
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: INK, marginBottom: 4 }}>
                Clear my data
              </div>
              <div
                style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: 11,
                  color: INK,
                  opacity: 0.65,
                  lineHeight: 1.5,
                }}
              >
                Delete contributions, wraps, imported identities, and any public share
                links. Keep your passphrase and install registration.
              </div>
            </div>
          </label>

          <label
            style={{
              display: 'flex',
              gap: 12,
              cursor: 'pointer',
              padding: '12px 14px',
              border: `2px solid ${mode === 'forget-device' ? INK : '#ccc'}`,
              borderRadius: 12,
              background: mode === 'forget-device' ? '#fff' : 'transparent',
            }}
          >
            <input
              type="radio"
              name="reset-mode"
              checked={mode === 'forget-device'}
              onChange={() => setMode('forget-device')}
              style={{ marginTop: 2, flexShrink: 0 }}
            />
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: INK, marginBottom: 4 }}>
                Forget this device
              </div>
              <div
                style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: 11,
                  color: INK,
                  opacity: 0.65,
                  lineHeight: 1.5,
                }}
              >
                Everything above, plus: delete the passphrase and install registration.
                Next launch will be a fresh setup. Use this if you forgot your passphrase.
              </div>
            </div>
          </label>
        </div>

        {/* Warning */}
        <div
          style={{
            background: '#FFF4DE',
            border: `1.5px solid ${INK}`,
            borderRadius: 10,
            padding: '10px 14px',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 11,
            color: INK,
            marginBottom: 20,
            lineHeight: 1.5,
          }}
        >
          ⚠ This is permanent. Encrypted data cannot be recovered without the passphrase.
        </div>

        {/* Server offline — mode B proceed prompt */}
        {offlineResult && mode === 'forget-device' && (
          <div
            style={{
              background: '#FFF4DE',
              border: `2px solid ${HOT}`,
              borderRadius: 10,
              padding: '12px 14px',
              marginBottom: 16,
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 11,
              color: INK,
              lineHeight: 1.5,
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 8 }}>
              Could not reach server.
            </div>
            <div style={{ marginBottom: 12, opacity: 0.8 }}>
              Orphaned server rows may persist until the TTL sweeper cleans them. You can
              still clear this device locally.
            </div>
            <button
              type="button"
              onClick={() => executeReset(true)}
              disabled={busy}
              style={{
                background: HOT,
                border: `2px solid ${INK}`,
                borderRadius: 8,
                padding: '8px 16px',
                fontFamily: 'Space Grotesk, sans-serif',
                fontSize: 13,
                fontWeight: 700,
                color: '#fff',
                cursor: busy ? 'not-allowed' : 'pointer',
                opacity: busy ? 0.6 : 1,
              }}
            >
              Proceed without server cleanup
            </button>
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 11,
              color: HOT,
              marginBottom: 16,
              lineHeight: 1.5,
            }}
          >
            {error}
          </div>
        )}

        {/* Confirmation input */}
        <div style={{ marginBottom: 20 }}>
          <label
            style={{
              display: 'block',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 11,
              color: INK,
              opacity: 0.7,
              marginBottom: 6,
            }}
          >
            Type RESET to confirm:
          </label>
          <input
            ref={inputRef}
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="RESET"
            disabled={busy}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 14,
              fontWeight: 700,
              background: '#fff',
              border: `2px solid ${INK}`,
              borderRadius: 10,
              padding: '10px 14px',
              color: INK,
              outline: 'none',
              opacity: busy ? 0.6 : 1,
            }}
          />
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            style={{
              background: 'transparent',
              border: `2px solid ${INK}`,
              borderRadius: 10,
              padding: '10px 22px',
              fontFamily: 'Space Grotesk, sans-serif',
              fontSize: 14,
              fontWeight: 600,
              color: INK,
              cursor: busy ? 'not-allowed' : 'pointer',
              opacity: busy ? 0.5 : 1,
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => executeReset()}
            disabled={!canConfirm}
            aria-disabled={!canConfirm}
            style={{
              background: canConfirm ? HOT : '#ccc',
              border: `2px solid ${INK}`,
              boxShadow: canConfirm ? `3px 3px 0 ${INK}` : 'none',
              borderRadius: 10,
              padding: '10px 22px',
              fontFamily: 'Space Grotesk, sans-serif',
              fontSize: 14,
              fontWeight: 700,
              color: canConfirm ? '#fff' : INK,
              cursor: canConfirm ? 'pointer' : 'not-allowed',
              transition: 'background 0.1s, box-shadow 0.1s',
            }}
          >
            {busy ? 'Resetting…' : 'Reset'}
          </button>
        </div>
      </div>
    </div>
  );
}
