'use client';

/*
 * Spec 50 — file-upload contribution provider.
 *
 * Two-step modal:
 *   Step 1 — user labels the batch (e.g. "Q1 commits from work laptop").
 *   Step 2 — user picks a model + file. A non-collapsible egress
 *            disclosure naming the chosen model's provider sits above
 *            the action buttons. The disclosure is mandatory: this is
 *            the only feature in the app that egresses contribution
 *            content, so the user must see it before clicking upload.
 *
 * On success, shows a result panel with the added / duplicate / rejected
 * counts and a "Your file has been discarded." line — same reassurance
 * the spec mandates.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { MODEL_OPTIONS, DEFAULT_MODEL_ID } from '@/lib/ai/models';
import {
  connectFileUploadIdentity,
  importIntoIdentity,
} from '@/lib/providers/orchestrator';

const INK = '#0A0A0A';
const CREAM = '#FFF4DE';
const PAPER = '#FBF5E5';
const HOT = '#FF4D2E';
const LIME = '#C6FF3B';

const MAX_FILE_BYTES = 256 * 1024;

function providerLabel(modelId: string): string {
  if (modelId.startsWith('anthropic:')) return 'Anthropic';
  if (modelId.startsWith('azure:')) return 'Azure Foundry';
  if (modelId.startsWith('ollama:')) return 'your local Ollama server';
  return 'the configured model provider';
}

type Stage = 'label' | 'file' | 'result';

type ImportSummary = {
  added: number;
  skippedExisting: number;
  rejectedRows: number;
};

export function ImportFromFileModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [stage, setStage] = useState<Stage>('label');
  const [label, setLabel] = useState('');
  const [modelId, setModelId] = useState<string>(DEFAULT_MODEL_ID);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  const mutation = useMutation({
    mutationFn: async (): Promise<ImportSummary> => {
      if (!file) throw new Error('Pick a file to upload.');
      const { identityId } = await connectFileUploadIdentity({ label: label.trim() });
      const result = await importIntoIdentity(identityId, file, {
        modelId,
        label: label.trim(),
      });
      return result;
    },
    onSuccess: (result) => {
      setSummary(result);
      setStage('result');
      queryClient.invalidateQueries({ queryKey: ['contributions'] });
      queryClient.invalidateQueries({ queryKey: ['identities'] });
    },
  });

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      setStage('label');
      setLabel('');
      setFile(null);
      setFileError(null);
      setSummary(null);
      setModelId(DEFAULT_MODEL_ID);
      mutation.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const provider = useMemo(() => providerLabel(modelId), [modelId]);

  if (!open) return null;

  function handleFile(picked: File | null) {
    setFileError(null);
    if (!picked) {
      setFile(null);
      return;
    }
    if (picked.size > MAX_FILE_BYTES) {
      setFile(null);
      setFileError('That file is over the 256 KB limit. Trim it down and try again.');
      return;
    }
    setFile(picked);
  }

  const labelTrimmed = label.trim();
  const labelValid = labelTrimmed.length > 0 && labelTrimmed.length <= 200;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-from-file-heading"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(10,10,10,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '24px 16px',
      }}
    >
      <div style={{
        background: PAPER, border: `2px solid ${INK}`, boxShadow: `6px 6px 0 ${INK}`,
        borderRadius: 20, padding: '24px 28px', maxWidth: 560, width: '100%',
        maxHeight: '90vh', overflow: 'auto', fontFamily: 'Space Grotesk, sans-serif',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: '0.14em', color: HOT, fontWeight: 700, margin: 0 }}>
            {stage === 'result' ? 'IMPORTED' : `STEP ${stage === 'label' ? '1' : '2'} OF 2`}
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'transparent', border: 'none', fontSize: 22,
              cursor: 'pointer', color: INK, lineHeight: 1, padding: 4,
            }}
          >✕</button>
        </div>

        <h2 id="import-from-file-heading" style={{
          fontFamily: 'Space Grotesk, sans-serif', fontSize: 24, fontWeight: 700,
          color: INK, margin: '0 0 14px',
        }}>
          {stage === 'result' ? 'All done.' : 'Import from a file'}
        </h2>

        {stage === 'label' && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (labelValid) setStage('file');
            }}
            style={{ display: 'grid', gap: 16 }}
          >
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: '0.1em', color: INK, opacity: 0.7 }}>
                LABEL THIS BATCH
              </span>
              <input
                type="text"
                autoFocus
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                maxLength={200}
                placeholder='e.g. "Work laptop, Q1 commits"'
                style={{
                  background: '#fff', border: `2px solid ${INK}`, borderRadius: 10,
                  padding: '10px 14px', fontSize: 15, color: INK, outline: 'none',
                  fontFamily: 'Space Grotesk, sans-serif',
                }}
              />
              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: INK, opacity: 0.55 }}>
                Re-uploading under the same label appends to the same identity.
              </span>
            </label>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="submit"
                disabled={!labelValid}
                style={{
                  background: labelValid ? HOT : '#ccc',
                  border: `2px solid ${INK}`, borderRadius: 10, boxShadow: `3px 3px 0 ${INK}`,
                  padding: '10px 22px', fontFamily: 'Space Grotesk, sans-serif',
                  fontSize: 14, fontWeight: 700, color: CREAM,
                  cursor: labelValid ? 'pointer' : 'not-allowed',
                }}
              >
                next →
              </button>
            </div>
          </form>
        )}

        {stage === 'file' && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (file && !mutation.isPending) mutation.mutate();
            }}
            style={{ display: 'grid', gap: 14 }}
          >
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: '0.1em', color: INK, opacity: 0.7 }}>
                MODEL
              </span>
              <select
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
                style={{
                  background: '#fff', border: `2px solid ${INK}`, borderRadius: 10,
                  padding: '10px 14px', fontSize: 14, color: INK, outline: 'none',
                  fontFamily: 'Space Grotesk, sans-serif',
                }}
              >
                {MODEL_OPTIONS.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
            </label>

            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: '0.1em', color: INK, opacity: 0.7 }}>
                FILE
              </span>
              <input
                type="file"
                onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
                style={{
                  background: '#fff', border: `2px solid ${INK}`, borderRadius: 10,
                  padding: '10px 14px', fontSize: 13, color: INK, outline: 'none',
                  fontFamily: 'JetBrains Mono, monospace',
                }}
              />
              {fileError && (
                <span role="alert" style={{ fontSize: 12, color: HOT, fontFamily: 'JetBrains Mono, monospace' }}>
                  {fileError}
                </span>
              )}
            </label>

            <div
              data-testid="egress-disclosure"
              style={{
                background: CREAM, border: `2px solid ${INK}`, borderRadius: 12,
                padding: '14px 16px', fontFamily: 'Space Grotesk, sans-serif',
                fontSize: 13, color: INK, lineHeight: 1.5,
              }}
            >
              <p style={{ margin: '0 0 6px', fontWeight: 700 }}>
                Heads up — this is different from the rest of Wrapped for Work.
              </p>
              <p style={{ margin: '0 0 6px' }}>
                Your file will be sent to{' '}
                <strong data-testid="egress-provider">{provider}</strong> to extract contributions.
                It is processed in memory and discarded immediately. The extracted
                contributions are encrypted and stored only on this device.
              </p>
              <p style={{ margin: 0, fontFamily: 'JetBrains Mono, monospace', fontSize: 11, opacity: 0.7 }}>
                Max file size: 256 KB. Text-based files only.
              </p>
            </div>

            {mutation.isError && (
              <p role="alert" style={{ fontSize: 13, color: HOT, fontFamily: 'Space Grotesk, sans-serif', margin: 0 }}>
                {mutation.error instanceof Error ? mutation.error.message : 'Import failed.'}
              </p>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setStage('label')}
                style={{
                  background: PAPER, border: `2px solid ${INK}`, borderRadius: 10,
                  padding: '10px 18px', fontFamily: 'Space Grotesk, sans-serif',
                  fontSize: 13, fontWeight: 600, color: INK, cursor: 'pointer',
                }}
              >
                back
              </button>
              <button
                type="submit"
                disabled={!file || mutation.isPending}
                style={{
                  background: file && !mutation.isPending ? HOT : '#ccc',
                  border: `2px solid ${INK}`, borderRadius: 10, boxShadow: `3px 3px 0 ${INK}`,
                  padding: '10px 22px', fontFamily: 'Space Grotesk, sans-serif',
                  fontSize: 14, fontWeight: 700, color: CREAM,
                  cursor: file && !mutation.isPending ? 'pointer' : 'not-allowed',
                }}
              >
                {mutation.isPending ? 'uploading…' : 'upload and extract'}
              </button>
            </div>
          </form>
        )}

        {stage === 'result' && summary && (
          <div style={{ display: 'grid', gap: 12 }}>
            <p style={{ fontSize: 16, margin: 0, color: INK }}>
              Imported <strong>{summary.added}</strong> contribution{summary.added === 1 ? '' : 's'}.
            </p>
            {summary.skippedExisting > 0 && (
              <p style={{ fontSize: 14, margin: 0, color: INK, opacity: 0.75 }}>
                {summary.skippedExisting} {summary.skippedExisting === 1 ? 'was a duplicate' : 'were duplicates'} (already in your dashboard).
              </p>
            )}
            {summary.rejectedRows > 0 && (
              <p style={{ fontSize: 14, margin: 0, color: INK, opacity: 0.75 }}>
                {summary.rejectedRows} {summary.rejectedRows === 1 ? "row didn't" : "rows didn't"} parse cleanly and {summary.rejectedRows === 1 ? 'was' : 'were'} skipped.
              </p>
            )}
            <p style={{
              fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: INK,
              opacity: 0.6, margin: '8px 0 0',
            }}>
              Your file has been discarded.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
              <button
                type="button"
                onClick={onClose}
                style={{
                  background: LIME, border: `2px solid ${INK}`, borderRadius: 10,
                  boxShadow: `3px 3px 0 ${INK}`, padding: '10px 22px',
                  fontFamily: 'Space Grotesk, sans-serif', fontSize: 14, fontWeight: 700,
                  color: INK, cursor: 'pointer',
                }}
              >
                done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
