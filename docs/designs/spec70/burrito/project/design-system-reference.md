# Design system reference — Burrito

Pair this with the sense-making workbench design brief. The brief
tells the designer **what** to design; this reference tells them
**what the app already looks like** so new surfaces sit comfortably
inside the existing visual world rather than redesigning it.

Sourced from the live codebase (`src/app/globals.css`,
`src/components/ui/Mx*`, `src/lib/palette.ts`,
`src/components/slides/SlideFrame.tsx`,
`src/components/dashboard/DashboardShell.tsx`) on 2026-05-16.

## Design philosophy (the team's own words)

The phrases used in code comments to anchor the language:

- **"Editorial brutalism softened by institutional modernism."**
- **"Maximalist editorial — bold borders, hard shadows, cream backgrounds."**
- **"Every surface should feel like a polished annual review artifact,
   not a generic SaaS theme."**
- **"Publication-grade hierarchy."**
- **"Avoid generic centered-app shells."**

A copy line on the dashboard that says it well:
*"a mirror, not a judge. burrito drafts. you edit. you own it."*

## Visual identity at a glance

- Brand name in lowercase, period included: **"burrito."**
- Logo mark: 🌯 emoji in a hot-colored 28×28 rounded square (8px
  radius) with a 2px ink border.
- Type signature: **italic Space Grotesk display, tight tracking
  (-0.03em to -0.05em)** + uppercase JetBrains Mono labels with wide
  tracking (0.1em to 0.3em).
- Hard offset shadows (no blur), 2px ink borders, pill or rounded
  corners.
- Bright accent colors used as full surfaces, never as gradients.

## Two surfaces that share the same primitives

### Dashboard / app shell — cream-paper, "day" theme
The everyday surface. Background is warm cream/paper. Cards float on
top with ink borders and hard offset shadows. Bright accent colors
appear as full surfaces on CTAs (the wrap CTA card is hot-red) and
as fills inside pills/badges. The session workbench, onboarding, and
session entry prompt all live in this surface.

### Wrap / slides — color-blocked, "publication" theme
Each slice (slide) has its own full-bleed color block — hot opener,
calm middle, ink finale. Massive italic stat numerals dominate. The
slide is meant to feel like one page of a designed annual report.
6px hard shadow on phone (390×844), 12px on desktop (1440×760). The
session workbench is **not** a slide; the wrap that eventually
renders from the record uses this treatment.

Both surfaces share fonts, border treatment, shadow language, and
accent palette.

## Color palettes (multi-palette system)

The app ships four palettes the user can switch between live.
Default is "Tomato." Every component reads colors from the active
palette rather than hard-coded hex. New designs should work in at
least the default; ideally reasonable across all four.

Palette slots are always: `(hot, lime, ink, cream, paper, accent,
accent2, accent3)`.

**Tomato (default):**
- Hot: `#FF4D2E` — primary accent, CTA fills, focal moments
- Lime: `#C6FF3B` — secondary accent, supporting energy
- Ink: `#0A0A0A` — borders, body text, shadow color
- Cream: `#FFF4DE` — primary background for cards
- Paper: `#FBF5E5` — secondary background for app shell
- Accent: `#6B3DFF` — tertiary accent (purple)
- Accent2: `#7BE3FF` — sky cyan
- Accent3: `#FFB3C7` — rose pink

**GovTech SG** (indigo + blue, "by the book"):
`#6137B3`, `#3D68BD`, `#1A1233`, `#F4F1FB`, `#E8E2F2`, `#9D7FE0`,
`#7FA3E8`, `#C9BBED`

**Soft** (muted but warm):
`#D97757`, `#D6E4B8`, `#2A2620`, `#F4EFE6`, `#EDE7D9`, `#7C6FB8`,
`#9DC4D8`, `#E8B4B8`

**Sunset** (mango + papaya, evening light):
`#F25C54`, `#FFD166`, `#1F0F2E`, `#FFF1E0`, `#FCE5CC`, `#9D4EDD`,
`#06A77D`, `#F49AC2`

## Typography

Three Google Fonts in active use:

- **Space Grotesk** — primary display + body. Weights 400/500/600/700/800.
  **Italic + tight tracking** is the signature on display headlines.
- **JetBrains Mono** — ALL labels, badges, metadata, timestamps,
  kind tags, status text. Always uppercase. Letter-spacing 0.08em
  to 0.3em. Weights 400/500/700.
- **DM Sans** — declared body fallback; rarely seen in practice.

(Syne is declared as an alt display font but Space Grotesk is the
workhorse.)

### Type scale observed in the codebase

Display (italic, font-weight 700–900, line-height 0.85–0.98):
- Slide hero numerals: 240px desktop, 112px phone (ghost variants: 320–540px)
- Slide headlines: 72px desktop, 34px phone
- Section heroes: `clamp(2.2rem, 5vw, 3rem)` (about 36–48px)
- Stat numerals on dashboard hero: 72–110px

Body (Space Grotesk, regular/medium, 1.5–1.6 line-height):
- Slide body: 22px desktop, 14px phone
- Card body: 14–15px
- Description: 14px, opacity 0.65–0.85

Mono labels (JetBrains Mono, uppercase, tracking 0.08–0.3em):
- Top header band: 10–13px
- Section labels: 11px ("RECENT", "BY CATEGORY", "YEAR RHYTHM")
- Badges: 9–10px
- Tiny metadata: 9–10px, opacity 0.4–0.55

## Component treatments

### Cards
```
background:    cream | paper | accent | white
border:        2px solid ink
border-radius: 12–16px
box-shadow:    4px 4px 0 ink     (hard, offset, no blur)
padding:       20–28px
```

Hover state on clickable cards:
```
transform:     translate(-1px, -1px) → translate(-2px, -2px)
box-shadow:    5px 5px 0 ink → 6px 6px 0 ink
transition:    0.1–0.15s ease
```

### Buttons
```
font-family:   Space Grotesk
font-weight:   700–800
border:        2px solid ink
border-radius: 10–999px   (999 = pill, common for primary CTAs)
box-shadow:    3px 3px 0 ink (rest) → 2px 2px 0 ink (hover)
transform:     translate(0,0) → translate(2px, 2px) on hover
transition:    0.08s ease
```

The hover behavior is a **press**: surface shifts down/right *into*
the shadow, shadow shrinks. Feels physical.

Background colors by intent:
- Primary CTA: hot fill, cream text
- Secondary: lime fill, ink text
- Tertiary: paper fill, ink text
- Disabled: opacity 0.5, cursor not-allowed

### Badges / pills
```
font-family:    JetBrains Mono
font-weight:    700–800
font-size:      9–11px
text-transform: uppercase
letter-spacing: 0.05–0.2em
border:         1.5px solid ink
border-radius:  4px (rectangular) | 999px (pill)
padding:        2–5px vertical / 8–14px horizontal
```

Pill chips on slides have a **signature rotation**: 1.4° increments
alternating across a row, with alternating background variants. Don't
align them perfectly — the slight rotation is the point.

### Inputs
```
font-family:   Space Grotesk
font-size:     16px
font-weight:   600
background:    white
border:        2px solid ink
border-radius: 10px
padding:       10–14px
outline:       none
```

Labels above inputs use mono caps:
```
font-family:    JetBrains Mono
font-size:      10px
letter-spacing: 0.1em
opacity:        0.7
```

### Top nav
- Background: cream
- Border-bottom: 2px solid ink
- Height: 56px
- Active tab: hot text + 2px hot underline
- Inactive tabs: ink text at opacity 0.55, lowercase
- Avatar: 32×32 circle, accent fill, ink border, mono initials in cream

## Layout

- Max content width: 1280px for dashboard, 1440×760 for slides
- Two-column dashboard: `1.4fr 1fr` (content left, sticky sidebar right)
- Generous internal padding on cards (20–32px)
- Mobile: collapses to single column at 767px breakpoint
- Sticky right sidebar on dashboard desktop

## Signature moves to use

New surfaces should borrow at least some of these so they feel
native.

1. **Hard offset shadows in ink.** Never `box-shadow: 0 4px 8px
   rgba(0,0,0,0.1)`. Always `box-shadow: 4px 4px 0 #0A0A0A`. Size
   scales with surface: 2–3px on small UI, 4–6px on cards, 12px on
   slide hero. Hover *shrinks* the shadow and shifts the surface
   "into" it, like pressing.

2. **2px ink borders, everywhere.** Cards, buttons, badges, inputs,
   logo mark, even tiny color dots in the palette switcher. The
   border is the line, not a subtle separator.

3. **Italic display type with tight tracking.** Headlines feel like
   editorial display — Space Grotesk italic, weight 700+,
   letter-spacing -0.03em to -0.05em, line-height 0.85–0.98. The
   italic is the voice.

4. **Mono caps for everything technical.** Section labels, status,
   metadata, badges. Always uppercase, always wide-tracked
   (0.1–0.28em). Mixing lowercase Space Grotesk prose with
   uppercase mono labels is the register shift the app leans on.

5. **Ghost numerals.** Massive italic numerals (320–540px) at low
   opacity (0.06–0.08), positioned off-edge as background to slide
   content. Slide move only — not for dashboard surfaces.

6. **Rotated pill chips.** Tags get 1–2° rotation alternating
   across a row. The slight imperfection is the texture.

7. **The "/ LABEL" prefix.** Topline labels on slides start with
   "/ " in mono caps + accent color. Same energy as a chapter marker.

8. **The "○ LABEL" prefix.** Section labels on the dashboard start
   with a small circle glyph (`◯` or `○`) followed by mono caps in
   accent color. Examples in use: "○ YOUR WRAPS",
   "○ 2026 · MAY · IN PROGRESS", "○ SETTINGS · CONTRIBUTION TOOLS".

9. **Privacy reminders, plainly stated.** A lime banner at the
   bottom of settings, a "🔒 nothing shared" line at the bottom of
   slides. Privacy is a design element, not a footnote.

10. **The hot color = the moment.** Hot (tomato red) appears
    sparingly — primary CTAs, year-end mode badges, active tab
    underline, focal stats. When you see it, it means "this is
    where attention goes."

11. **Lowercase casual + uppercase technical, side by side.** The
    headline "wrap your year so far." sits above the mono label
    "READY ENOUGH". The product speaks in two voices on purpose;
    keep them distinct.

12. **The rotated text-in-block highlight.** Phrases like the word
    "tools" in "connect your tools." get a hot-colored background
    block with 6px padding, ink-on-cream color, and a -1.5° rotation.
    Used sparingly on hero headlines to mark the key word.

## Copy register

Two voices used intentionally:

- **Lowercase casual Space Grotesk prose** — "wrap your year so far.",
  "we watch the work you've already done. nothing manual.",
  "ready in 60 seconds...", "a mirror, not a judge."
- **Uppercase mono technical labels** — "WRAPPED FOR WORK · 2026",
  "01 / 10", "YEAR RHYTHM", "FIRST LAUNCH", "BY CATEGORY",
  "+ ADD CONTRIBUTION MANUALLY".

The lowercase prose carries warmth and intent; the mono caps carry
structure and authorship. Don't blur them — keep the registers
distinct.

Words the product **will not** use (this is brand policy, not
preference):

- "highlights", "top contributions", "best work", "most impactful"
- "key contributions", "your standout"
- "AI-generated for you", "we wrote this for you"

Words the product *does* use, and you should preserve:

- "wrap" (noun for the artifact, lowercase)
- "your record", "your year", "what you noticed"
- "things you spent time on", "people you worked with most"
- "we sketched this — your turn", "edit freely"

## What NOT to use

If you find yourself reaching for these, you've drifted into generic
SaaS territory and the design will feel off:

- Soft blurred drop shadows (`box-shadow: 0 4px 8px rgba(0,0,0,0.1)`)
- Gradients as decoration (the app uses a single subtle radial
  gradient on the body's near-black variant — nothing else)
- Pastel-on-pastel low-contrast surfaces
- Skeuomorphic depth, glass morphism, neumorphism
- Stock SaaS color palettes (Stripe blue, Notion grays, etc.)
- Floating action buttons / Material FABs
- iOS-style bottom sheets
- Generic icon sets applied directly (Feather, Heroicons) — the app
  uses emoji and Unicode glyphs (🌯, ◯, ◈, ✕, ←, →, ▾) for marks
- Sans-serif title-case headlines ("This Is A Title")
- Animated/gradient text effects
- Streaks, points, badges as gamification

The aesthetic comes from confidence in editorial restraint, not from
layering effects. Lean on the type and the borders.

## Reference: existing dashboard card composition

```
[card surface]
  background:    p.cream
  border:        2px solid p.ink
  border-radius: 16
  box-shadow:    4px 4px 0 p.ink
  padding:       20–24px

  [label, mono caps 10–11px, tracking 0.12em, color p.ink @ 0.7 opacity]
    "BY CATEGORY"

  [spacing ~14px]

  [content]
```

## Reference: existing slide composition (phone variant)

```
[slide surface]
  size:          390 × 844
  background:    theme.bg (per-slice color: hot | lime | ink | sky | rose | purple | paper | cream)
  color:         theme.fg
  border:        2px solid #0A0A0A
  box-shadow:    6px 6px 0 #0A0A0A
  padding:       28px

  [top band, mono 10px, tracking 0.22em, opacity 0.85]
    "WRAPPED FOR WORK · 2026"      "01 / 10"

  [accent label, mono 12px, tracking 0.28em, color theme.accent]
    "/ LABEL"

  [ghost numeral, italic 320px, opacity 0.06–0.08]
    positioned absolute, top 80, right -30

  [stat, italic 112px, font-weight 900, text-shadow: 5px 5px 0 accent]

  [headline, italic 34px, weight 900, leading 0.95, tracking -0.03em]

  [body, 14px, opacity 0.85, leading 1.55, max-width 320]

  [supporting: rotated pill chips row, alternating variants]

  [bottom row: mode badge | "🔒 nothing shared"]

  [accent stripe, 4px tall, full width, at bottom — year-end mode only]
```

## Reference: actual file paths the designer can ask for

If the designer wants to look at any of these directly:

- Colors + tokens: `src/app/globals.css`, `src/lib/palette.ts`
- Fonts setup: `src/app/layout.tsx`
- Buttons / badges / palette switcher: `src/components/ui/Mx*.tsx`
- Slide grammar: `src/components/slides/SlideFrame.tsx`
- Dashboard composition: `src/components/dashboard/DashboardShell.tsx`

The dashboard composition file is the single best reference for
how all these pieces compose on a real working surface. If you only
look at one file, look at that one.
