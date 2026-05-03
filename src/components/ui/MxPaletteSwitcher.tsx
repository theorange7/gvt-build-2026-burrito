'use client';
import { useState } from 'react';
import type { MxPalette } from '@/lib/palette';
import { MX_PALETTES } from '@/lib/palette';

interface MxPaletteSwitcherProps {
  p: MxPalette;
  currentId: string;
  onPick: (id: string) => void;
}

export function MxPaletteSwitcher({ p, currentId, onPick }: MxPaletteSwitcherProps) {
  const [open, setOpen] = useState(false);
  const mxMono = 'var(--font-jetbrains-mono), "JetBrains Mono", ui-monospace, monospace';
  const mxFont = 'var(--font-space-grotesk), "Space Grotesk", system-ui, sans-serif';

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px 5px 5px',
          background: '#fff', border: `2px solid ${p.ink}`, borderRadius: 999,
          cursor: 'pointer', fontFamily: mxMono, fontSize: 11, color: p.ink,
          boxShadow: `2px 2px 0 ${p.ink}`,
        }}
      >
        <span style={{ display: 'flex', gap: 2 }}>
          {p.swatch.map((c, i) => (
            <span key={i} style={{ width: 12, height: 18, background: c, borderRadius: 2, border: `1px solid ${p.ink}` }} />
          ))}
        </span>
        <span style={{ fontWeight: 700 }}>{p.label}</span>
        <span style={{ fontSize: 9 }}>▾</span>
      </button>
      {open && (
        <div
          style={{
            position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 30,
            background: p.cream, border: `2px solid ${p.ink}`, borderRadius: 12,
            boxShadow: `5px 5px 0 ${p.ink}`, padding: 10, width: 240,
          }}
        >
          <div style={{ fontFamily: mxMono, fontSize: 10, letterSpacing: '0.16em', color: '#666', padding: '4px 6px 8px' }}>
            CHOOSE A PALETTE
          </div>
          {Object.values(MX_PALETTES).map((pp) => (
            <button
              key={pp.id}
              onClick={() => { onPick(pp.id); setOpen(false); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 8px',
                background: pp.id === currentId ? '#fff' : 'transparent', border: 'none', cursor: 'pointer',
                fontFamily: mxFont, color: p.ink, textAlign: 'left', borderRadius: 8, marginBottom: 2,
              }}
            >
              <span style={{ display: 'flex', gap: 2 }}>
                {pp.swatch.map((c, i) => (
                  <span key={i} style={{ width: 14, height: 22, background: c, borderRadius: 3, border: `1.5px solid ${p.ink}` }} />
                ))}
              </span>
              <span style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{pp.label}</div>
                <div style={{ fontSize: 10, color: '#666', fontFamily: mxMono }}>{pp.sub}</div>
              </span>
              {pp.id === currentId && <span style={{ fontSize: 14 }}>●</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
