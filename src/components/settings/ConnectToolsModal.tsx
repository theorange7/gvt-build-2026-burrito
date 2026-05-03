'use client';
import { useState } from 'react';

interface MxPalette {
  hot: string; lime: string; ink: string; cream: string; paper: string;
  accent: string; accent2: string; accent3: string; [key: string]: unknown;
}

interface ConnectToolsModalProps {
  p: MxPalette;
  onClose: () => void;
}

export function ConnectToolsModal({ p, onClose }: ConnectToolsModalProps) {
  const [connected, setConnected] = useState({
    github: true, jira: false, slack: false, confluence: false,
  });

  const mxMono = '"JetBrains Mono", ui-monospace, monospace';
  const mxFont = '"Space Grotesk", system-ui, sans-serif';

  const tools = [
    { id: 'github' as const, name: 'GitHub', glyph: '⌂', dot: p.lime, sub: 'PRs · reviews · commits' },
    { id: 'jira' as const, name: 'Jira', glyph: '◆', dot: p.accent2, sub: 'tickets · sprints' },
    { id: 'slack' as const, name: 'Slack', glyph: '#', dot: p.accent, sub: 'threads · decisions' },
    { id: 'confluence' as const, name: 'Confluence', glyph: '¶', dot: p.hot, sub: 'docs · rfcs' },
  ] as const;

  const count = Object.values(connected).filter(Boolean).length;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(10,10,10,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 50, backdropFilter: 'blur(2px)',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 560, background: p.cream,
          border: `2px solid ${p.ink}`, borderRadius: 18,
          boxShadow: `8px 8px 0 ${p.ink}`, padding: 26,
          fontFamily: mxFont, color: p.ink,
        }}
      >
        {/* header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontFamily: mxMono, fontSize: 11, color: p.accent, letterSpacing: '0.18em' }}>◍ STEP 01 / 02</div>
            <h2 style={{ margin: '8px 0 4px', fontSize: 36, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1 }}>
              connect your{' '}
              <span style={{
                background: p.hot, color: p.cream, padding: '0 10px',
                display: 'inline-block', transform: 'rotate(-1.5deg)', borderRadius: 6,
              }}>tools</span>.
            </h2>
            <div style={{ fontSize: 13, color: '#444', marginTop: 6 }}>
              we watch the work you&apos;ve already done. nothing manual.
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', fontSize: 22, cursor: 'pointer', color: p.ink, lineHeight: 1 }}
          >✕</button>
        </div>

        {/* tools grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 18 }}>
          {tools.map((t) => {
            const isOn = connected[t.id];
            return (
              <div
                key={t.id}
                onClick={() => setConnected((prev) => ({ ...prev, [t.id]: !isOn }))}
                style={{
                  border: `2px solid ${p.ink}`, borderRadius: 12, padding: '12px 14px',
                  background: isOn ? t.dot : '#fff',
                  display: 'flex', alignItems: 'center', gap: 10,
                  cursor: 'pointer', boxShadow: `3px 3px 0 ${p.ink}`,
                  transition: 'background 0.15s',
                }}
              >
                <div style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: isOn ? '#fff' : t.dot,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 16, fontWeight: 800, border: `2px solid ${p.ink}`,
                }}>{t.glyph}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{t.name}</div>
                  <div style={{ fontSize: 10, color: isOn ? p.ink : '#666', fontFamily: mxMono }}>
                    {isOn ? '● connected' : t.sub}
                  </div>
                </div>
                <div style={{
                  fontSize: 11, fontWeight: 800, padding: '4px 8px', borderRadius: 999,
                  background: isOn ? p.ink : 'transparent',
                  color: isOn ? p.cream : p.ink,
                  border: `1.5px solid ${p.ink}`, fontFamily: mxMono,
                }}>{isOn ? 'ON' : '+ LINK'}</div>
              </div>
            );
          })}
        </div>

        {/* privacy notice */}
        <div style={{
          marginTop: 18, padding: '10px 14px', borderRadius: 10,
          background: p.lime, border: `2px solid ${p.ink}`,
          fontFamily: mxMono, fontSize: 11, lineHeight: 1.5,
        }}>
          🔒 your data stays yours. wraps are private until you share a link.
        </div>

        {/* footer */}
        <div style={{ marginTop: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontFamily: mxMono, fontSize: 11, color: '#555' }}>{count} / 4 connected</div>
          <button
            onClick={count > 0 ? onClose : undefined}
            style={{
              fontFamily: mxFont, fontWeight: 800, fontSize: 13,
              padding: '8px 14px', borderRadius: 999,
              background: count > 0 ? p.hot : '#ddd',
              color: count > 0 ? p.cream : '#888',
              border: `2px solid ${p.ink}`,
              cursor: count > 0 ? 'pointer' : 'default',
              boxShadow: `4px 4px 0 ${p.ink}`,
            }}
          >
            {count > 0 ? 'continue →' : 'pick at least one'}
          </button>
        </div>
      </div>
    </div>
  );
}
