'use client';
import { useEffect, useState } from 'react';

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

export function EventDetailDrawer({ p, event, onClose }: Props) {
  const [visible, setVisible] = useState(false);
  const mxMono = '"JetBrains Mono", ui-monospace, monospace';
  const mxFont = '"Space Grotesk", system-ui, sans-serif';

  useEffect(() => {
    if (event) {
      // small delay so CSS transition fires
      const id = setTimeout(() => setVisible(true), 10);
      return () => clearTimeout(id);
    } else {
      setVisible(false);
    }
  }, [event]);

  if (!event) return null;

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(10,10,10,0.55)',
        display: 'flex', justifyContent: 'flex-end',
        zIndex: 40,
      }}
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
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', fontSize: 22, cursor: 'pointer', color: p.ink, lineHeight: 1 }}
          >✕</button>
        </div>

        {/* date + tag */}
        <div style={{ fontFamily: mxMono, fontSize: 11, color: '#666', marginTop: 16, letterSpacing: '0.1em' }}>
          {event.m} · #{event.tag}
        </div>

        {/* title */}
        <h2 style={{ fontSize: 38, fontWeight: 800, lineHeight: 1, letterSpacing: '-0.03em', margin: '6px 0 0', textWrap: 'balance' }}>
          {event.title}
        </h2>

        {/* source card */}
        <div style={{
          marginTop: 18, padding: 14, background: '#fff',
          border: `2px solid ${p.ink}`, borderRadius: 12,
          boxShadow: `3px 3px 0 ${p.ink}`,
        }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' as const, marginBottom: 8 }}>
            <span style={{ fontFamily: mxMono, fontSize: 10, color: '#666', letterSpacing: '0.1em' }}>SOURCE</span>
            <span style={{
              fontFamily: mxMono, fontSize: 10, fontWeight: 800,
              padding: '3px 8px', borderRadius: 4,
              background: p.cream, color: p.ink,
              border: `1.5px solid ${p.ink}`,
            }}>{event.detail.source}</span>
            {event.detail.refs.map((r) => (
              <span key={r} style={{ fontFamily: mxMono, fontSize: 11, color: p.accent, fontWeight: 600 }}>{r}</span>
            ))}
          </div>
          <div style={{ fontSize: 14, lineHeight: 1.5, color: '#222' }}>{event.detail.body}</div>
        </div>

        {/* importance */}
        <div style={{ marginTop: 18 }}>
          <div style={{ fontFamily: mxMono, fontSize: 10, color: '#666', letterSpacing: '0.18em', marginBottom: 6 }}>
            IMPORTANCE
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              flex: 1, height: 14, background: p.paper,
              border: `2px solid ${p.ink}`, borderRadius: 7, overflow: 'hidden',
            }}>
              <div style={{ width: `${event.detail.weight * 100}%`, height: '100%', background: p.hot }} />
            </div>
            <div style={{ fontFamily: mxMono, fontSize: 13, fontWeight: 700 }}>
              {Math.round(event.detail.weight * 100)}
            </div>
          </div>
          <div style={{ fontFamily: mxMono, fontSize: 10, color: '#666', marginTop: 4 }}>
            you can adjust this — burrito drafts, you decide.
          </div>
        </div>

        {/* actions */}
        <div style={{ marginTop: 24, display: 'flex', gap: 10 }}>
          {[
            { label: 'edit ✎', bg: p.lime, color: p.ink },
            { label: 'change tag', bg: '#fff', color: p.ink },
            { label: 'hide', bg: '#fff', color: '#888', onClick: onClose },
          ].map((btn) => (
            <button
              key={btn.label}
              onClick={btn.onClick}
              style={{
                fontFamily: mxFont, fontWeight: 800, fontSize: 13,
                padding: '8px 14px', borderRadius: 999,
                background: btn.bg, color: btn.color,
                border: `2px solid ${p.ink}`,
                cursor: 'pointer',
                boxShadow: `4px 4px 0 ${p.ink}`,
              }}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
