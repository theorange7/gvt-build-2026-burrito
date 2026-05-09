import type { MxPalette } from '@/lib/palette';

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  palette?: MxPalette;
  children: React.ReactNode;
};

export function MxButton({ palette, children, className = '', style, ...rest }: Props) {
  const paletteStyle: React.CSSProperties = palette
    ? {
        backgroundColor: palette.hot,
        color: palette.cream,
        boxShadow: `4px 4px 0 ${palette.ink}`,
      }
    : {
        backgroundColor: 'var(--mx-hot)',
        color: 'var(--mx-cream)',
        boxShadow: '4px 4px 0 var(--mx-ink)',
      };

  return (
    <button
      className={`mx-font-display inline-flex items-center justify-center px-5 py-2 rounded-full font-semibold text-sm transition-all duration-150 hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-none active:translate-x-0.5 active:translate-y-0.5 ${className}`}
      style={{ ...paletteStyle, ...style }}
      {...rest}
    >
      {children}
    </button>
  );
}
