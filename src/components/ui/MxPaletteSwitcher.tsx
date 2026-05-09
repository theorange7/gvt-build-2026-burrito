import { palettes, type MxPalette } from '@/lib/palette';

type Props = {
  current: string;
  onPick: (id: string) => void;
  palette?: MxPalette;
  className?: string;
};

export function MxPaletteSwitcher({ current, onPick, palette, className = '' }: Props) {
  const bg = palette?.paper ?? 'var(--mx-paper)';
  const fg = palette?.ink ?? 'var(--mx-ink)';
  const border = palette?.hot ?? 'var(--mx-hot)';

  return (
    <select
      value={current}
      onChange={(e) => onPick(e.target.value)}
      className={`mx-font-mono text-xs font-medium uppercase tracking-widest rounded-sm px-2 py-1 cursor-pointer ${className}`}
      style={{ backgroundColor: bg, color: fg, border: `2px solid ${border}` }}
      aria-label="Switch palette"
    >
      {Object.values(palettes).map((p) => (
        <option key={p.id} value={p.id}>
          {p.label}
        </option>
      ))}
    </select>
  );
}
