'use client';
import type { MxPalette } from '@/lib/palette';

interface MxBadgeProps {
  p: MxPalette;
  children: React.ReactNode;
  bg?: string;
  color?: string;
}

export function MxBadge({ p, children, bg, color }: MxBadgeProps) {
  return (
    <span
      style={{
        fontFamily: 'var(--font-jetbrains-mono), "JetBrains Mono", ui-monospace, monospace',
        fontSize: 10,
        fontWeight: 800,
        padding: '3px 8px',
        borderRadius: 4,
        background: bg ?? p.lime,
        color: color ?? p.ink,
        letterSpacing: '0.05em',
        border: `1.5px solid ${p.ink}`,
        display: 'inline-block',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}
