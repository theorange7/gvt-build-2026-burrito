'use client';
import { useState } from 'react';
import type { MxPalette } from '@/lib/palette';

interface MxButtonProps {
  p: MxPalette;
  children: React.ReactNode;
  bg?: string;
  color?: string;
  big?: boolean;
  style?: React.CSSProperties;
  onClick?: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
}

export function MxButton({ p, children, bg, color, big = false, style, onClick, disabled, type = 'button' }: MxButtonProps) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        fontFamily: 'var(--font-space-grotesk), "Space Grotesk", system-ui, sans-serif',
        fontWeight: 800,
        fontSize: big ? 16 : 13,
        padding: big ? '12px 22px' : '8px 14px',
        borderRadius: 999,
        background: bg ?? p.ink,
        color: color ?? p.cream,
        border: `2px solid ${p.ink}`,
        cursor: disabled ? 'not-allowed' : 'pointer',
        boxShadow: hover && !disabled ? `2px 2px 0 ${p.ink}` : `4px 4px 0 ${p.ink}`,
        transform: hover && !disabled ? 'translate(2px,2px)' : 'translate(0,0)',
        transition: 'all 0.08s',
        letterSpacing: '0.01em',
        opacity: disabled ? 0.5 : 1,
        ...style,
      }}
    >
      {children}
    </button>
  );
}
