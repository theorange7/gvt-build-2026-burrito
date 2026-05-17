# Spec 32 — Share-viewer visual parity with the in-app experience

**Status**: Shaped — ready to pick up
**Branch**: both (client + new `wrap-experience/` package + share-viewer)
**Appetite**: large (≤ 1 week)
**Last shaped**: 2026-05-17

## Problem

Spec 31 shipped shareable highlight wheels behind a hard bundle-size
budget. To stay inside that budget the viewer was implemented as a
hand-authored vanilla-JS recap: CSS transitions, system fonts, a
simple Prev/Next carousel, and no per-slice visual treatment. It
honours the privacy contract and renders the right *words*, but it
looks nothing like what the user just spent the dashboard
celebrating.

The in-app experience the user sees (`WrapDesktop`, `WrapPhone`,
`src/components/slides/*`) is what makes this product feel like
"Spotify Wrapped, for engineering work":

- A 1600×900 full-bleed player that scales to the viewport.
- Ten distinct per-slice components — `LaunchesShipped`, `Velocity`,
  `CrossTeamImpact`, `DeepWorkStreak`, `Mentorship`, `Initiative`,
  `CollaborationStyle`, `Consistency`, `HighlightReel`, `Identity` —
  each with its own typography, charts, and palette beats.
- Framer Motion entry/exit transitions and the auto-advance pacing
  (6s per slide).
- The editorial palette and brand fonts (Space Grotesk +
  JetBrains Mono).

A recipient who opens the shared link today sees a stripped-down
substitute. The send-to-LinkedIn use case loses most of its punch.
The promise of the share button is *"share the moment you just saw"*
and we are not keeping it.

We want the share-viewer bundle to render the same wrap with the
same components, fonts, motion, and pacing the user saw — modulo
device-specific affordances that don't make sense for a recipient
(close button, palette switcher, dashboard chrome).

## Solution shape

Extract the wrap presentation layer into a workspace package both
the Next.js client and the share-viewer esbuild bundle import. The
share-viewer becomes a thin entry point: read the inline JSON the
server stamped, mount the same `WrapExperience` component the
client mounts inside `/wrap?id=...`. No SSR, no Next.js inside the
worker — the existing publish step (stamp template, upload to blob)
stays exactly as spec 31 wrote it. The bundle gets bigger, the
visuals get equal.

### New workspace package

```
wrap-experience/
  src/
    WrapExperience.tsx        ← moved from src/components/wrap/
    WrapDesktop.tsx           ← moved from src/components/wrap/
    WrapPhone.tsx             ← moved from src/components/wrap/
    slides/                   ← moved from src/components/slides/
      SlideFrame.tsx
      LaunchesShipped.tsx
      Velocity.tsx
      CrossTeamImpact.tsx
      DeepWorkStreak.tsx
      Mentorship.tsx
      Initiative.tsx
      CollaborationStyle.tsx
      Consistency.tsx
      HighlightReel.tsx
      Identity.tsx
    palette.ts                ← the MX_PALETTE constant
    fonts.css                 ← @font-face declarations
    fonts/                    ← woff2 binaries, self-hosted
      space-grotesk-{400,600,700}.woff2
      jetbrains-mono-{400,700}.woff2
    index.ts                  ← public exports
  package.json                ← peer-deps on react, react-dom, framer-motion
```

Both `src/` (Next client) and `share-viewer/src/` import from
`@wrapped/wrap-experience`. The client's existing imports of
`@/components/wrap/*` and `@/components/slides/*` are rewritten in
the same PR — single source of truth, no fork.

### Share-viewer becomes thin

```tsx
// share-viewer/src/main.tsx — replaces the current vanilla main.ts
import { createRoot } from 'react-dom/client';
import { WrapExperience } from '@wrapped/wrap-experience';

const node = document.getElementById('wrap-data');
const data = node?.textContent ? JSON.parse(node.textContent) : null;
const root = document.getElementById('viewer-root');

if (data && root) {
  createRoot(root).render(
    <WrapExperience
      id="shared"
      mode={data.mode}
      title={data.title}
      slices={data.slices}
      // share-only: hide close button, hide palette switcher,
      // suppress the router.back() handler the client wires up.
      embeddedFor="share"
    />,
  );
}
```

`WrapExperience` gains an optional `embeddedFor?: 'app' | 'share'`
prop. When set to `'share'`:

- The close button is hidden (a recipient has nowhere to go back to).
- The palette switcher and dashboard chrome don't render (already
  out of `WrapExperience`'s scope — confirm in the move).
- `router.back()` is not called (the share-viewer has no Next
  router context; pass a noop `onClose` from the share entry).

### Build pipeline

`share-viewer/esbuild.config.mjs` already does the bundle. The
update is small:

- Switch entry to `main.tsx`.
- Add `loader: { '.woff2': 'file' }` so font files are emitted into
  `dist/assets/fonts/`.
- Add a JSX/TS preset; enable React's automatic JSX runtime so we
  don't need to import React at the top of every slide file.
- Run a one-shot Tailwind build for any slide that uses Tailwind
  classes, producing `dist/viewer.css`. (Audit during the move —
  slides currently mix inline styles with a few `className`s. If
  the Tailwind footprint is tiny, prefer rewriting those styles
  inline to keep the viewer free of Tailwind altogether.)

The deploy artifact path stays the same: `server/dist/share-viewer/`
holds `index.template.html` + `viewer.js` + `viewer.css` +
`assets/fonts/*.woff2`. The blob upload in `wrapWorker.publishShareBundle`
gains font uploads (one extra `uploadBundle` argument or — simpler —
let it accept an `assets: Record<string, Buffer>` map so future
additions don't require touching the worker).

### Font self-hosting

Spec 31's privacy invariant disallows third-party hostnames in the
bundle (no Google Fonts). Self-host the brand fonts as woff2 files
shipped inside the bundle. License-permitting (Space Grotesk is
SIL OFL 1.1, JetBrains Mono is Apache 2.0 — both fine). One
`@font-face` block in `fonts.css`, referenced relative
(`./assets/fonts/space-grotesk-600.woff2`).

### Bundle budget

The 150 KB gzipped ceiling spec 31 set for the vanilla viewer is
incompatible with React + Framer Motion + 10 slide components +
self-hosted fonts. The new budget is **≤ 350 KB gzipped**
(JS+CSS+fonts combined, measured on the built `dist/`). Asserted by
a build-time check that fails CI if the artifact exceeds the
budget. Bundle-size discipline goes through this number, not
through forbidding libraries individually.

Why 350 KB: React 19 + react-dom (~140 KB gzipped) + Framer Motion
(~50 KB gzipped) + slide components + Tailwind/CSS + woff2 fonts
(~80 KB combined). Sets a real ceiling that catches accidental
heavy additions (icon packs, lodash, date-fns at full surface)
while leaving room for the visual goal.

### Spec 30 video probe stays

The single allowlisted same-origin HEAD probe for `./video.mp4`
that spec 31 reserves remains in the share-viewer entry. Spec 30
(when it lands) still needs to slot a video into the same slug
folder. The probe lives in the share entry's `useEffect`, not in
`WrapExperience` — `WrapExperience` stays oblivious so the in-app
embed doesn't try to fetch.

### Privacy invariants

All spec 31 invariants survive verbatim:

- No `XMLHttpRequest`, no `sendBeacon`, no third-party hostnames in
  the built bundle.
- Exactly one `fetch()` call, and it's the `./video.mp4` HEAD probe.
- `noindex,nofollow,noarchive` meta tag still emitted by the template.
- No `installId` / `userId` / `externalId` / `jobId` in the inline
  JSON or anywhere in the rendered HTML.

The static-analysis tests in `test/unit/privacy-invariants.test.ts`
and `server/test/unit/privacy-invariants.test.ts` continue to pass
without modification.

## Rabbit holes

- **Don't fork the slide components.** The whole point of this
  spec is "single source of truth between in-app and shared." If
  the move to `wrap-experience/` is partial — slides moved but
  `WrapDesktop` left behind, or vice versa — the parity drift will
  be back within a release. Move the entire presentation layer in
  one PR.
- **Don't run Next.js inside the share-viewer build.** The viewer
  is React + Framer Motion + esbuild, no Next runtime. If a slide
  imports `next/image`, `next/link`, or `useRouter` during the
  audit, rewrite it to a vanilla `<a>` / `<img>` first.
- **Don't use Google Fonts at runtime.** Self-host or ship without
  brand fonts. The privacy invariant against third-party hostnames
  is non-negotiable.
- **Don't try to share Tailwind config between Next and esbuild.**
  Either (a) prefer inline styles in the moved components and
  drop Tailwind from the viewer entirely, or (b) run a separate
  one-shot Tailwind pass over the moved sources as part of
  `share-viewer/esbuild.config.mjs`. Option (a) is the
  recommendation if the Tailwind footprint in slides turns out to
  be small (it probably is — most slides already inline-style).
- **Don't add a server-side render pass.** Spec 31's "don't run
  Next.js inside the Function" rabbit hole still applies. The
  bundle is CSR. The cost is a tiny mount delay on first load,
  which is fine for a "save and email it" artifact.
- **Don't try to preserve dashboard navigation.** No "back to
  dashboard," no palette switcher, no "edit this wrap." Recipients
  are not the owner. The `embeddedFor` switch in
  `WrapExperience` is the seam — keep it small.

## No-gos

- **No SSR / no Next.js in the share-viewer bundle.** Same line as
  spec 31.
- **No third-party hostnames** — no Google Fonts, no analytics, no
  CDN-loaded JS, no remote images. Everything ships in the bundle
  or it doesn't ship.
- **No telemetry.** The allowlisted `./video.mp4` HEAD probe is
  the only network call, same as spec 31.
- **No editor mode.** The viewer is read-only forever. If a future
  spec wants in-bundle editing, that's its own design conversation.
- **No live data.** The bundle is a snapshot taken at publish time
  (spec 31 already wrote this rule; it stays). Re-publish on edit
  is a separate spec when wraps become editable.
- **No bundle size regressions past 350 KB gzipped.** The CI gate
  is part of this spec's verification; don't merge work that punts
  it to follow-up.
- **No new top-level dependencies in the client** beyond
  `@wrapped/wrap-experience` itself. Don't take this as an
  opportunity to introduce a UI library, a chart library, or a new
  font stack — the slides already render correctly today.

## Verification

- **Visual parity (Playwright)**: A new test in
  `test/e2e/share-viewer-parity.spec.ts` mounts the same wrap in
  the dashboard (`/wrap?id=...`) and in the standalone bundle
  (`file:///…/index.html`), takes per-slide screenshots, and
  compares them via Playwright's `toHaveScreenshot` snapshot
  diff with a tight pixel-diff threshold. Snapshots are committed
  under `test/e2e/__screenshots__/`.
- **Per-slice component coverage**: a unit test asserts every
  `sliceKey` in the production slice list has a corresponding
  rendered component in the bundle (no silent fallback to a
  default treatment).
- **Bundle size gate (CI)**: `share-viewer/scripts/check-size.mjs`
  measures the gzipped total of `dist/{viewer.js,viewer.css,assets/fonts/*}`
  and fails with a clear message if it exceeds 350 KB. Wired into
  the client CI workflow alongside the existing privacy-invariants
  check.
- **Privacy invariants still hold**: the existing static-analysis
  tests pass without modification against the new bundle:
  - No XMLHttpRequest / sendBeacon usage.
  - No third-party hostnames anywhere in the built JS or CSS.
  - Exactly one `fetch()` call, targeting `./video.mp4` with
    `method: 'HEAD'`.
- **Offline check (Playwright)**: open the built `index.html` from
  a `file:///` URL. Assert the carousel mounts, slides render, and
  the page does not throw on the failed video HEAD probe (same
  shape as spec 31's offline check, extended to cover all ten
  slides).
- **In-app regression sweep**: existing dashboard / wrap E2E tests
  (`screenshots.spec.ts`, `share-screenshots.spec.ts`) still pass
  unchanged — the move from `src/components/wrap/` and
  `src/components/slides/` to `@wrapped/wrap-experience` should
  be source-only; behaviour is identical.
- **Spec 31 share publish + revoke tests** still pass — the
  worker's publish step now uploads two extra blobs (the fonts and
  the larger viewer.js), but the integration test's bundle
  assertions broaden to "uploads at least the template + JS + CSS"
  rather than exact-count.

## Notes

- Relates to **spec 31** (shareable highlight wheels) — this spec
  pays down the deliberate visual debt called out in spec 31's
  `## Done` block ("hand-authored vanilla JS bundle rather than
  reusing slide visuals").
- Relates to **spec 30** (composer / music-synced video). The
  share viewer becoming React-based does not change the spec-30
  contract: the composer still drops `wraps/{slug}/video.mp4`
  into the existing slug folder, and the bundle's HEAD probe
  reveals the link. No coordination needed.
- Branch suggestion: `claude/share-viewer-visual-parity-XXXXX`.

### Open design questions (resolve before kicking off)

These are best-judgment defaults; if a different call is right,
edit the spec before the implementing agent picks it up.

1. **Bundle budget at 350 KB gzipped.** React + Framer Motion +
   fonts will likely land between 250–320 KB. If 350 KB feels too
   loose, tighten to 300 KB and pull motion-one or react-spring as
   a lighter alternative to Framer Motion — but only if the visual
   delta is acceptable. Recommendation: ship at 350 KB, measure,
   tighten in a follow-up if there's headroom.
2. **Move target — workspace package vs shared directory.** The
   spec describes a new top-level `wrap-experience/` workspace
   package. The lighter alternative is to keep the components in
   `src/components/{wrap,slides}/` and let `share-viewer` import
   them via a relative path (`../../src/components/...`). The
   workspace package is cleaner long-term; the relative import is
   one fewer thing to configure. Recommendation: the package.
3. **Ship both phone and desktop in the viewer.** Today's
   `WrapExperience` switches via media query. Recipients land on
   phones too (LinkedIn, email-on-phone, etc.). Recommendation:
   keep the media-query switch in the bundle, ship both. If
   bundle size forces a cut, drop the phone variant first since
   the desktop variant already fluid-scales reasonably well.
4. **Auto-advance vs manual nav.** App auto-advances every 6s
   with play/pause. Spec 31's viewer is manual-only.
   Recommendation: match the app — auto-advance on, with the
   same play/pause control. A static manual viewer is the
   fallback if auto-advance causes accessibility complaints.
