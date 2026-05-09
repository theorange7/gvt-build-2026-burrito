'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { deleteContribution, updateContribution } from '@/lib/local-store/contributions';
import type { Contribution, ContributionCategory } from '@/lib/types';

interface MxPalette {
  hot: string; lime: string; ink: string; cream: string; paper: string;
  accent: string; accent2: string; accent3: string; [key: string]: unknown;
}

export interface DrawerEvent {
  id: string;
  m: string;
  kind: string;
  title: string;
  tag: string;
  color: string;
  detail: {
    source: string;
    refs: string[];
    body: string;
    weight: number;
  };
}

interface Props {
  p: MxPalette;
  event: DrawerEvent | null;
  onClose: () => void;
}

const CATEGORIES: ContributionCategory[] = ['delivery', 'collaboration', 'mentorship', 'process', 'leadership'];

export function EventDetailDrawer({ p, event, onClose }: Props) {
  const queryClient = useQueryClient();
  const [visible, setVisible] = useState(false);
  const [mode, setMode] = useState<'view' | 'edit-signal' | 'edit-tag' | 'confirm-delete'>('view');
  const [draftSignal, setDraftSignal] = useState('');
  const mxMono = '"JetBrains Mono", ui-monospace, monospace';
  const mxFont = '"Space Grotesk", system-ui, sans-serif';

  useEffect(() => {
    if (event) {
      const id = setTimeout(() => setVisible(true), 10);
      return () => clearTimeout(id);
    } else {
      setVisible(false);
      setMode('view');
    }
  }, [event]);

  // Reset edit state when a new event opens
  useEffect(() => {
    if (event) {
      setMode('view');
      setDraftSignal(event.title);
    }
  }, [event?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const deleteMutation = useMutation({
    mutationFn: () => deleteContribution(event!.id),
    onSuccess: () => {
      queryClient.setQueryData<Contribution[]>(['contributions'], (current = []) =>
        current.filter((c) => c.id !== event!.id),
      );
      onClose();
    },
  });

  const saveMutation = useMutation({
    mutationFn: (changes: { category?: ContributionCategory; signal?: string }) =>
      updateContribution(event!.id, changes),
    onSuccess: (_data, changes) => {
      queryClient.setQueryData<Contribution[]>(['contributions'], (current = []) =>
        current.map((c) => {
          if (c.id !== event!.id) return c;
          return {
            ...c,
            ...(changes.category ? { category: changes.category } : {}),
            ...(changes.signal ? { signal: changes.signal } : {}),
          };
        }),
      );
      setMode('view');
    },
  });

  if (!event) return null;

  const actionBtn = (label: string, bg: string, color: string, onClick: () => void) => (
    <button
      key={label}
      type="button"
      onClick={onClick}
      style={{
        fontFamily: mxFont, fontWeight: 800, fontSize: 13,
        padding: '8px 14px', borderRadius: 999,
        background: bg, color,
        border: `2px solid ${p.ink}`,
        cursor: 'pointer',
        boxShadow: `4px 4px 0 ${p.ink}`,
      }}
    >
      {label}
    </button>
  );

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(10,10,10,0.55)', display: 'flex', justifyContent: 'flex-end', zIndex: 40 }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 460, height: '100%', background: p.cream,
          borderLeft: `2px solid ${p.ink}`,
          padding: 28, fontFamily: mxFont, color: p.ink,
          overflow: 'auto', boxSizing: 'border-box',
          transform: visible ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.25s cubic-bezier(0.25,0.46,0.45,0.94)',
        }}
      >
        {/* header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{
            fontFamily: mxMono, fontSize: 10, fontWeight: 800,
            padding: '3px 8px', borderRadius: 4,
            background: event.color, color: p.ink,
            letterSpacing: '0.05em', border: `1.5px solid ${p.ink}`,
          }}>
            {event.kind}
          </span>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', fontSize: 22, cursor: 'pointer', color: p.ink, lineHeight: 1 }}
          >✕</button>
        </div>

        {/* date + tag */}
        <div style={{ fontFamily: mxMono, fontSize: 11, color: '#666', marginTop: 16, letterSpacing: '0.1em' }}>
          {event.m} · #{event.tag}
        </div>

        {/* title / signal — editable */}
        {mode === 'edit-signal' ? (
          <div style={{ marginTop: 8 }}>
            <textarea
              value={draftSignal}
              onChange={(e) => setDraftSignal(e.target.value)}
              rows={3}
              autoFocus
              style={{
                width: '100%', boxSizing: 'border-box',
                fontSize: 22, fontWeight: 700, fontFamily: mxFont,
                background: '#fff', border: `2px solid ${p.hot}`, borderRadius: 10,
                padding: '10px 12px', color: p.ink, outline: 'none', resize: 'vertical',
              }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              {actionBtn(
                saveMutation.isPending ? 'Saving…' : 'Save',
                p.lime, p.ink,
                () => saveMutation.mutate({ signal: draftSignal }),
              )}
              {actionBtn('Cancel', '#fff', p.ink, () => setMode('view'))}
            </div>
          </div>
        ) : (
          <h2 style={{ fontSize: 38, fontWeight: 800, lineHeight: 1, letterSpacing: '-0.03em', margin: '6px 0 0', textWrap: 'balance' }}>
            {event.title}
          </h2>
        )}

        {/* source card */}
        <div style={{ marginTop: 18, padding: 14, background: '#fff', border: `2px solid ${p.ink}`, borderRadius: 12, boxShadow: `3px 3px 0 ${p.ink}` }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' as const, marginBottom: 8 }}>
            <span style={{ fontFamily: mxMono, fontSize: 10, color: '#666', letterSpacing: '0.1em' }}>SOURCE</span>
            <span style={{ fontFamily: mxMono, fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 4, background: p.cream, color: p.ink, border: `1.5px solid ${p.ink}` }}>
              {event.detail.source}
            </span>
            {event.detail.refs.map((r) => (
              <span key={r} style={{ fontFamily: mxMono, fontSize: 11, color: p.accent, fontWeight: 600 }}>{r}</span>
            ))}
          </div>
          <div style={{ fontSize: 14, lineHeight: 1.5, color: '#222' }}>{event.detail.body}</div>
        </div>

        {/* importance */}
        <div style={{ marginTop: 18 }}>
          <div style={{ fontFamily: mxMono, fontSize: 10, color: '#666', letterSpacing: '0.18em', marginBottom: 6 }}>IMPORTANCE</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1, height: 14, background: p.paper, border: `2px solid ${p.ink}`, borderRadius: 7, overflow: 'hidden' }}>
              <div style={{ width: `${event.detail.weight * 100}%`, height: '100%', background: p.hot }} />
            </div>
            <div style={{ fontFamily: mxMono, fontSize: 13, fontWeight: 700 }}>{Math.round(event.detail.weight * 100)}</div>
          </div>
          <div style={{ fontFamily: mxMono, fontSize: 10, color: '#666', marginTop: 4 }}>
            you can adjust this — burrito drafts, you decide.
          </div>
        </div>

        {/* change tag inline */}
        {mode === 'edit-tag' && (
          <div style={{ marginTop: 20 }}>
            <div style={{ fontFamily: mxMono, fontSize: 10, color: '#666', letterSpacing: '0.12em', marginBottom: 10 }}>PICK A CATEGORY</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => saveMutation.mutate({ category: cat })}
                  disabled={saveMutation.isPending}
                  style={{
                    fontFamily: mxMono, fontSize: 11, fontWeight: 700,
                    padding: '6px 14px', borderRadius: 999,
                    background: cat === event.tag ? p.hot : '#fff',
                    color: cat === event.tag ? p.cream : p.ink,
                    border: `2px solid ${p.ink}`,
                    boxShadow: `3px 3px 0 ${p.ink}`,
                    cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.08em',
                  }}
                >
                  {cat}
                </button>
              ))}
            </div>
            {actionBtn('Cancel', '#fff', p.ink, () => setMode('view'))}
          </div>
        )}

        {/* confirm delete */}
        {mode === 'confirm-delete' && (
          <div style={{ marginTop: 20, background: '#fff', border: `2px solid ${p.hot}`, borderRadius: 12, boxShadow: `3px 3px 0 ${p.hot}`, padding: '16px 18px' }}>
            <p style={{ fontFamily: mxMono, fontSize: 11, fontWeight: 700, color: p.hot, letterSpacing: '0.1em', margin: '0 0 8px' }}>DELETE THIS ENTRY?</p>
            <p style={{ fontFamily: mxFont, fontSize: 13, color: p.ink, margin: '0 0 14px', opacity: 0.7 }}>This removes the contribution from your timeline permanently.</p>
            <div style={{ display: 'flex', gap: 8 }}>
              {actionBtn(deleteMutation.isPending ? 'Deleting…' : 'Yes, delete', p.hot, p.cream, () => deleteMutation.mutate())}
              {actionBtn('Cancel', '#fff', p.ink, () => setMode('view'))}
            </div>
          </div>
        )}

        {/* actions */}
        {mode === 'view' && (
          <div style={{ marginTop: 24, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {actionBtn('edit ✎', p.lime, p.ink, () => { setDraftSignal(event.title); setMode('edit-signal'); })}
            {actionBtn('change tag', '#fff', p.ink, () => setMode('edit-tag'))}
            {actionBtn('delete', '#fff', p.hot, () => setMode('confirm-delete'))}
          </div>
        )}

        {saveMutation.isError && (
          <p style={{ fontFamily: mxMono, fontSize: 11, color: p.hot, marginTop: 10 }}>
            {saveMutation.error instanceof Error ? saveMutation.error.message : 'Save failed.'}
          </p>
        )}
      </div>
    </div>
  );
}
