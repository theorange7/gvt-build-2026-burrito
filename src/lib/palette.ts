export interface MxPalette {
  id: string;
  label: string;
  sub: string;
  hot: string;
  lime: string;
  ink: string;
  cream: string;
  paper: string;
  accent: string;
  accent2: string;
  accent3: string;
  swatch: [string, string, string, string];
}

export const MX_PALETTES: Record<string, MxPalette> = {
  tomato: {
    id: 'tomato', label: 'Tomato', sub: 'the original — hot + electric',
    hot: '#FF4D2E', lime: '#C6FF3B', ink: '#0A0A0A', cream: '#FFF4DE', paper: '#FBF5E5',
    accent: '#6B3DFF', accent2: '#7BE3FF', accent3: '#FFB3C7',
    swatch: ['#FF4D2E','#C6FF3B','#6B3DFF','#0A0A0A'],
  },
  govtech: {
    id: 'govtech', label: 'GovTech SG', sub: 'indigo + blue, by the book',
    hot: '#6137B3', lime: '#3D68BD', ink: '#1A1233', cream: '#F4F1FB', paper: '#E8E2F2',
    accent: '#9D7FE0', accent2: '#7FA3E8', accent3: '#C9BBED',
    swatch: ['#6137B3','#3D68BD','#9D7FE0','#1A1233'],
  },
  soft: {
    id: 'soft', label: 'Soft', sub: 'easy on the eyes — muted but warm',
    hot: '#D97757', lime: '#D6E4B8', ink: '#2A2620', cream: '#F4EFE6', paper: '#EDE7D9',
    accent: '#7C6FB8', accent2: '#9DC4D8', accent3: '#E8B4B8',
    swatch: ['#D97757','#D6E4B8','#7C6FB8','#2A2620'],
  },
  sunset: {
    id: 'sunset', label: 'Sunset', sub: 'mango + papaya, evening light',
    hot: '#F25C54', lime: '#FFD166', ink: '#1F0F2E', cream: '#FFF1E0', paper: '#FCE5CC',
    accent: '#9D4EDD', accent2: '#06A77D', accent3: '#F49AC2',
    swatch: ['#F25C54','#FFD166','#9D4EDD','#1F0F2E'],
  },
};

export const DEFAULT_PALETTE_ID = 'tomato';

export function getPalette(id: string): MxPalette {
  return MX_PALETTES[id] ?? MX_PALETTES[DEFAULT_PALETTE_ID];
}
