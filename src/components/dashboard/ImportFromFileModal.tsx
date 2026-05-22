'use client';

/*
 * Spec 50 — file-upload contribution provider (timeline UX revision).
 *
 * Two-step modal:
 *   Step 1 — user labels the batch (e.g. "Q1 commits from work laptop").
 *   Step 2 — user picks a model + file. A non-collapsible egress
 *            disclosure naming the chosen model's provider sits above
 *            the action buttons.
 *
 * On submit we enqueue the upload into the shared in-memory ImportQueue
 * (capped at 3 concurrent) and close the modal immediately — the
 * pending row appears below the timeline action buttons and pops off
 * when the upload completes.
 */
import { useEffect, useMemo, useState } from 'react';
import { MODEL_OPTIONS, DEFAULT_MODEL_ID } from '@/lib/ai/models';
import { useImportQueue } from './ImportQueueContext';

const INK = '#0A0A0A';
const CREAM = '#FFF4DE';
const PAPER = '#FBF5E5';
const HOT = '#FF4D2E';

const MAX_FILE_BYTES = 256 * 1024;
const ACCEPT_ATTR = '.txt,.md,.docx,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const ALLOWED_EXTS = new Set(['txt', 'md', 'docx']);

function extOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
}

function providerLabel(modelId: string): string {
  if (modelId.startsWith('anthropic:')) return 'Anthropic';
  if (modelId.startsWith('azure:')) return 'Azure Foundry';
  if (modelId.startsWith('ollama:')) return 'your local Ollama server';
  return 'the configured model provider';
}

type Stage = 'label' | 'file';

export function ImportFromFileModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { enqueue } = useImportQueue();
  const [stage, setStage] = useState<Stage>('label');
  const [label, setLabel] = useState('');
  const [modelId, setModelId] = useState<string>(DEFAULT_MODEL_ID);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

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
      setModelId(DEFAULT_MODEL_ID);
    }
  }, [open]);

  const provider = useMemo(() => providerLabel(modelId), [modelId]);

  if (!open) return null;

  function handleFile(picked: File | null) {
    setFileError(null);
    if (!picked) {
      setFile(null);
      return;
    }
    if (!ALLOWED_EXTS.has(extOf(picked.name))) {
      setFile(null);
      setFileError('Only .txt, .md, and .docx files are supported.');
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
            STEP {stage === 'label' ? '1' : '2'} OF 2
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
          Import from a file
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
              if (!file) return;
              enqueue({ label: labelTrimmed, modelId, file });
              onClose();
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
                accept={ACCEPT_ATTR}
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
              <p style={{ margin: '0 0 6px' }}>
                <strong>The upload lives only in this tab.</strong> Don&apos;t close it or
                let your laptop sleep until the row clears — the queue isn&apos;t saved.
              </p>
              <p style={{ margin: 0, fontFamily: 'JetBrains Mono, monospace', fontSize: 11, opacity: 0.7 }}>
                Max file size: 256 KB. Accepted: .txt, .md, .docx. Up to 3 imports run in parallel.
              </p>
            </div>

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
                disabled={!file}
                style={{
                  background: file ? HOT : '#ccc',
                  border: `2px solid ${INK}`, borderRadius: 10, boxShadow: `3px 3px 0 ${INK}`,
                  padding: '10px 22px', fontFamily: 'Space Grotesk, sans-serif',
                  fontSize: 14, fontWeight: 700, color: CREAM,
                  cursor: file ? 'pointer' : 'not-allowed',
                }}
              >
                upload and extract
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
