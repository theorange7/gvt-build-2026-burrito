export type MxPalette = {
  id: string;
  label: string;
  hot: string;
  lime: string;
  ink: string;
  cream: string;
  paper: string;
  accent: string;
  accent2: string;
  accent3: string;
};

export const palettes: Record<string, MxPalette> = {
  tomato: {
    id: 'tomato',
    label: 'Tomato',
    hot: '#ff3b1f',
    lime: '#c8f000',
    ink: '#1a0a00',
    cream: '#fff8f5',
    paper: '#ffeee8',
    accent: '#ff3b1f',
    accent2: '#ff8c00',
    accent3: '#c8f000',
  },
  govtech: {
    id: 'govtech',
    label: 'GovTech',
    hot: '#0052cc',
    lime: '#36b37e',
    ink: '#091e42',
    cream: '#f4f5f7',
    paper: '#ebecf0',
    accent: '#0052cc',
    accent2: '#00b8d9',
    accent3: '#36b37e',
  },
  soft: {
    id: 'soft',
    label: 'Soft',
    hot: '#e040fb',
    lime: '#b2ff59',
    ink: '#1a0033',
    cream: '#fdf6ff',
    paper: '#f3e5f5',
    accent: '#e040fb',
    accent2: '#7c4dff',
    accent3: '#b2ff59',
  },
  sunset: {
    id: 'sunset',
    label: 'Sunset',
    hot: '#ff6d00',
    lime: '#ffea00',
    ink: '#1a0a00',
    cream: '#fff8f0',
    paper: '#fff3e0',
    accent: '#ff6d00',
    accent2: '#f50057',
    accent3: '#ffea00',
  },
};

export function getPalette(id: string): MxPalette {
  return palettes[id] ?? palettes.tomato;
}
