import type { MxPalette } from '@/lib/palette';

type Props = {
  label: string;
  palette?: MxPalette;
  className?: string;
};

export function MxBadge({ label, palette, className = '' }: Props) {
  const style = palette
    ? ({ '--badge-bg': palette.ink, '--badge-color': palette.lime } as React.CSSProperties)
    : undefined;

  return (
    <span
      className={`mx-font-mono inline-block px-2 py-0.5 text-xs font-medium tracking-widest uppercase rounded-sm ${className}`}
      style={
        style ?? {
          backgroundColor: 'var(--mx-ink)',
          color: 'var(--mx-lime)',
        }
      }
    >
      {label}
    </span>
  );
}
