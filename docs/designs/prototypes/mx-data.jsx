// Maximalist prototype — palettes + data

const MX_PALETTES = {
  tomato: {
    id: 'tomato', label: 'Tomato',
    sub: 'the original — hot + electric',
    hot: '#FF4D2E', lime: '#C6FF3B', ink: '#0A0A0A', cream: '#FFF4DE', paper: '#FBF5E5',
    accent: '#6B3DFF', accent2: '#7BE3FF', accent3: '#FFB3C7',
    swatch: ['#FF4D2E','#C6FF3B','#6B3DFF','#0A0A0A'],
  },
  govtech: {
    id: 'govtech', label: 'GovTech SG',
    sub: 'indigo + blue, by the book',
    hot: '#6137B3',     // GovTech primary indigo/purple
    lime: '#3D68BD',    // GovTech secondary blue
    ink: '#1A1233',     // deep indigo-black
    cream: '#F4F1FB',
    paper: '#E8E2F2',
    accent: '#9D7FE0',  // light indigo
    accent2: '#7FA3E8', // light blue
    accent3: '#C9BBED',
    swatch: ['#6137B3','#3D68BD','#9D7FE0','#1A1233'],
  },
  soft: {
    id: 'soft', label: 'Soft',
    sub: 'easy on the eyes — muted but warm',
    hot: '#D97757',     // muted terracotta
    lime: '#D6E4B8',    // sage
    ink: '#2A2620',
    cream: '#F4EFE6',
    paper: '#EDE7D9',
    accent: '#7C6FB8',  // dusty violet
    accent2: '#9DC4D8', // dusty sky
    accent3: '#E8B4B8', // dusty rose
    swatch: ['#D97757','#D6E4B8','#7C6FB8','#2A2620'],
  },
  sunset: {
    id: 'sunset', label: 'Sunset',
    sub: 'mango + papaya, evening light',
    hot: '#F25C54',     // coral
    lime: '#FFD166',    // mango
    ink: '#1F0F2E',     // aubergine
    cream: '#FFF1E0',
    paper: '#FCE5CC',
    accent: '#9D4EDD',  // grape
    accent2: '#06A77D', // jade
    accent3: '#F49AC2',
    swatch: ['#F25C54','#FFD166','#9D4EDD','#1F0F2E'],
  },
};

const mxFont = '"Space Grotesk", "Inter", system-ui, sans-serif';
const mxMono = '"JetBrains Mono", ui-monospace, monospace';

const MX_DATA = {
  totals: { contributions: 181, categories: 7, unblocks: 12, ships: 4 },
  months: ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'],
  monthly: [4, 8, 6, 14, 22, 18, 12, 9, 27, 31, 19, 11],
  categoryDefs: [
    { name: 'shipping', pct: 42, key: 'hot' },
    { name: 'reviews',  pct: 21, key: 'lime' },
    { name: 'strategy', pct: 17, key: 'accent' },
    { name: 'people',   pct: 12, key: 'accent2' },
    { name: 'craft',    pct:  8, key: 'accent3' },
  ],
  events: [
    { id: 'e1', m: 'OCT 24', kind: 'SHIP', title: 'launched payment-rail v2', tag: 'shipping', cKey: 'hot',
      detail: { source: 'github', refs: ['pr-882','pr-901'],
        body: 'You led the migration from rail-v1 to v2 over 3 weeks. p99 latency fell from 168ms → 101ms. Avoided 3 outages in the rollout window. Twelve teammates unblocked across the onboarding squad.',
        weight: 0.94 } },
    { id: 'e2', m: 'OCT 18', kind: 'PR', title: '14 reviews · approved 11', tag: 'reviews', cKey: 'lime',
      detail: { source: 'github', refs: ['pr-871','pr-873','pr-879','+11'],
        body: 'A heavy review week — most across the platform team. Median turnaround 4h.',
        weight: 0.62 } },
    { id: 'e3', m: 'SEP 30', kind: 'DOC', title: 'rfc: identity service split', tag: 'strategy', cKey: 'accent',
      detail: { source: 'confluence', refs: ['rfc-014'],
        body: 'You authored RFC-014 proposing the identity service split. Read by 22 people, edited 6 times. Decision: accepted at the architecture sync.',
        weight: 0.81 } },
    { id: 'e4', m: 'SEP 22', kind: 'CHAT', title: 'unblocked onboarding squad', tag: 'people', cKey: 'accent2',
      detail: { source: 'slack', refs: ['#onboarding-sq'],
        body: 'You jumped into a deploy thread on a Friday afternoon. The unblock saved a Monday rollback for four engineers.',
        weight: 0.55 } },
    { id: 'e5', m: 'AUG 11', kind: 'SHIP', title: 'cut cold-start by 28%', tag: 'shipping', cKey: 'hot',
      detail: { source: 'github', refs: ['pr-810'],
        body: 'Lazy-loaded the auth module. Cold-start fell 410ms → 295ms across all clients.',
        weight: 0.78 } },
  ],
};

const MX_SLIDES = [
  { kind: 'intro', topline: '2026', title: 'YOUR YEAR,\nWRAPPED.', sub: 'a 60-second look at what you actually did.', dur: 4 },
  { kind: 'stat',  topline: 'YOU CAUGHT', big: '181', unit: 'contributions', sub: 'across four tools, all year.', dur: 5 },
  { kind: 'feature', topline: 'BIGGEST WIN', big: '40%', unit: 'p99 latency drop',
    sub: 'you led the payment-rail v2 migration. twelve teammates unblocked. three outages avoided.', dur: 7 },
  { kind: 'category', topline: 'YOUR TOP CATEGORY', big: 'shipping', sub: '42% of your weighted impact this year.', dur: 6 },
  { kind: 'people', topline: 'YOU MADE OTHERS FASTER', big: '12', unit: 'teammates unblocked',
    sub: 'across 4 squads. 28 messages worth thanking, ranked.',
    names: ['priya','marcus','aisha','jin','sam','noor','+ 6'], dur: 6 },
  { kind: 'rhythm', topline: 'YOUR MONTH', big: 'OCT', sub: 'your busiest month — 31 contributions.', dur: 5 },
  { kind: 'final', topline: '·', title: 'A WRAP\nWORTH SHARING.', sub: 'edit anything. share when ready. nothing leaves until you say.', dur: 6 },
];

// Past wraps (archive)
const MX_ARCHIVE = [
  { id: 'w-2025', label: '2025 · Year', total: 248, top: 'shipping', date: 'Dec 31, 2025', cover: 'tomato' },
  { id: 'w-2025-q3', label: '2025 · Q3 snapshot', total: 71, top: 'reviews', date: 'Sep 30, 2025', cover: 'sunset' },
  { id: 'w-2025-q2', label: '2025 · Q2 snapshot', total: 58, top: 'strategy', date: 'Jun 30, 2025', cover: 'soft' },
  { id: 'w-2024', label: '2024 · Year', total: 192, top: 'people', date: 'Dec 31, 2024', cover: 'govtech' },
];

// Helper: derive `palette.categories[]` with resolved colors for a chosen palette.
function MX_categoriesFor(p) {
  return MX_DATA.categoryDefs.map(c => ({ ...c, color: p[c.key] }));
}
function MX_eventsFor(p) {
  return MX_DATA.events.map(e => ({ ...e, color: p[e.cKey] }));
}

window.MX_PALETTES = MX_PALETTES;
window.mxFont = mxFont;
window.mxMono = mxMono;
window.MX_DATA = MX_DATA;
window.MX_SLIDES = MX_SLIDES;
window.MX_ARCHIVE = MX_ARCHIVE;
window.MX_categoriesFor = MX_categoriesFor;
window.MX_eventsFor = MX_eventsFor;
