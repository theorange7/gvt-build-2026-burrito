// Editorial prototype — data + shared bits

const ED = {
  paper: '#F4EFE6',
  paperDeep: '#E8E0CF',
  paperLight: '#FAF6EC',
  ink: '#15110D',
  inkSoft: '#3A322A',
  red: '#A42121',
  redDeep: '#7A1717',
  accent: '#3F4F2E',
  rule: '#15110D',
};

const edFont = {
  serif: '"GT Sectra", "Tiempos Headline", "Iowan Old Style", Georgia, serif',
  body: '"Source Serif 4", "Iowan Old Style", Georgia, serif',
  sans: '"Söhne", "Inter", system-ui, sans-serif',
  mono: '"JetBrains Mono", "GT America Mono", monospace',
};

const ED_DATA = {
  totals: { contributions: 181, categories: 7, unblocks: 12, ships: 4 },
  months: ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'],
  monthly: [4, 8, 6, 14, 22, 18, 12, 9, 27, 31, 19, 11],
  categories: [
    { name: 'Shipping',  pct: 42, color: '#A42121' },
    { name: 'Reviewing', pct: 21, color: '#15110D' },
    { name: 'Strategy',  pct: 17, color: '#3F4F2E' },
    { name: 'People',    pct: 12, color: '#3A322A' },
    { name: 'Other',     pct:  8, color: '#9A9285' },
  ],
  events: [
    { id: 'e1', d: '24 OCT', kind: 'Shipping', title: 'Migration: payment-rail v.2 reaches main',
      detail: { source: 'github · pr-882, pr-901', refs: ['p99 ↓ 40%', '12 unblocked', '3 outages avoided'],
        body: 'In the eighth week of the third quarter, a payment-rail migration reached main without ceremony — and twelve teammates found their work, suddenly, unblocked. Tail latency fell from 168ms to 101ms; three outages were avoided in the weeks that followed.',
        weight: 0.94 } },
    { id: 'e2', d: '18 OCT', kind: 'Reviewing', title: 'Fourteen reviews; eleven approved',
      detail: { source: 'github · 14 PRs', refs: ['median 4h turnaround'],
        body: 'A heavy review week, distributed across the platform team. The cadence held even as feature pressure mounted.',
        weight: 0.62 } },
    { id: 'e3', d: '30 SEP', kind: 'Strategy', title: 'Request for comment, identity service split',
      detail: { source: 'confluence · rfc-014', refs: ['22 readers', '6 edits', 'accepted'],
        body: 'You authored RFC-014 proposing the identity service split. Read by 22 colleagues, edited 6 times, accepted at the architecture sync.',
        weight: 0.81 } },
    { id: 'e4', d: '22 SEP', kind: 'People', title: 'A thread that unblocked twelve teammates',
      detail: { source: 'slack · #onboarding-sq', refs: ['friday afternoon'],
        body: 'You jumped into a deploy thread on a Friday afternoon. The unblock saved a Monday rollback for four engineers.',
        weight: 0.55 } },
    { id: 'e5', d: '11 AUG', kind: 'Shipping', title: 'A 28% reduction in cold-start latency',
      detail: { source: 'github · pr-810', refs: ['410ms → 295ms'],
        body: 'A quiet refactor: lazy-loaded the auth module. Cold-start latency dropped across all clients.',
        weight: 0.78 } },
  ],
};

const ED_SLIDES = [
  { kind: 'cover', topline: 'The Personal Annual', volume: 'Vol. I — MMXXVI', tagline: 'A year, recorded.' },
  { kind: 'figure', topline: 'Year to Date', big: '181', cap: 'contributions, indexed.', body: 'Across four sources — github, jira, slack, confluence — the year, so far.' },
  { kind: 'feature', tag: 'The Quiet Migration',
    head: 'You cut p99 latency by forty per cent — and barely mentioned it.',
    body: 'In the eighth week of the third quarter, a payment-rail migration reached main without ceremony — and twelve teammates found their work, suddenly, unblocked.',
    figures: [['168ms', 'before'], ['101ms', 'after'], ['12', 'unblocked']],
    pull: 'The figures, recorded by the platform itself: a fall in tail latency, three outages avoided.' },
  { kind: 'category', topline: 'By Category', head: 'Where the year went.', body: 'A breakdown by weight, not count.', breakdown: ED_DATA.categories },
  { kind: 'people', topline: 'In Confidence', head: 'You made others faster, twelve times over.',
    body: 'The unmeasured kind of work: the threads, the unblocks, the rubber-duck reviews. Counted here for once.',
    names: ['Priya', 'Marcus', 'Aisha', 'Jin', 'Sam', 'Noor', '+ six others'] },
  { kind: 'rhythm', topline: 'Figure 2 — Activity by month', head: 'A year in twelve columns.', monthly: ED_DATA.monthly,
    body: 'October was the busiest. May was the quietest you’d been since joining.' },
  { kind: 'colophon', topline: 'Colophon', head: 'A wrap, awaiting your edit.', body: 'Burrito drafts a periodical from the work you’ve already done. Edit anything before it is read by anyone else. Nothing leaves until you share a link.' },
];

window.ED = ED;
window.edFont = edFont;
window.ED_DATA = ED_DATA;
window.ED_SLIDES = ED_SLIDES;
