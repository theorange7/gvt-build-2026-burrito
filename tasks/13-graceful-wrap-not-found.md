# Spec 13 — Graceful "wrap not on this device"

**Status**: Shaped — ready to pick up
**Branch**: client
**Appetite**: small (≤ 1 day; realistically ~half day)
**Last shaped**: 2026-05-09

## Problem

Hitting `/wrap?id=<random>` (or `/wrap/<id>` depending on routing — see
`src/app/wrap/[id]/page.tsx`) without a local pending row or saved wrap
currently flows through the polling hook, hits the server, gets `404`, and
renders `phase: 'failed', error: 'not-found'`. The result is a generic red
error state.

The `WrapViewer` already has a much nicer "this wrap isn't on this device"
copy, but the polling path bypasses it entirely and the gracious 404 never
shows.

The three real cases for this URL all converge on the same UX:

1. **Stale link** — user bookmarked or shared the URL after the local row
   was deleted (clear-on-lock, browser eviction, manual delete).
2. **Wrong device** — wrap was generated on laptop, URL opened on phone.
3. **Random / typo'd ID** — manually-typed ID that never existed.

Showing "failed: not-found" makes case 1 and 2 feel like a system failure,
when they're a feature of being local-first.

## Solution shape

Two changes: routing logic and a new component.

### Routing logic (in `src/app/wrap/[id]/page.tsx`)

Decide what to render based on local state, not the network:

1. **Pending row exists** for this id → `<PendingWrapView jobId=...>` (current
   behaviour; the polling hook continues running).
2. **Saved wrap exists** for this id → `<WrapViewer>` (current behaviour).
3. **Neither** → render `<WrapNotFound jobId=...>` directly. Do **NOT**
   start polling. Don't hit the server.

### New case: pending row exists, server returns 404

Today the polling hook removes the pending row and propagates the error
verbatim, leaving the user on a `phase: 'failed'` screen. New behaviour:
when `pollWrap` gets a 404, drop the pending row AND route into the same
`<WrapNotFound>` panel. The pending table is a hint, not a guarantee — a
404 from the server means whatever was happening is over and not recoverable
locally.

### New component: `<WrapNotFound>`

```
┌─────────────────────────────────────────────────┐
│                                                 │
│         🔍  We don't have this wrap.            │
│                                                 │
│         Wraps live on your device, not in       │
│         the cloud. If you generated this on     │
│         another machine, switch to that one     │
│         to view it.                             │
│                                                 │
│         ┌─────────────────────────────────────┐ │
│         │       Back to dashboard             │ │
│         └─────────────────────────────────────┘ │
│                                                 │
│         (jobId: a7f1…2c4)                       │
│                                                 │
└─────────────────────────────────────────────────┘
```

Component shape:
- Title + body copy as above.
- Single primary action: "Back to dashboard" → routes to `/dashboard`.
- Optional small `(jobId: a7f1…2c4)` footer behind a "Show details"
  affordance — useful for support, but hidden by default to avoid
  confusing end users.

Reuse `SlideFrame` styling so the panel feels native to the wrap UI rather
than a router-level error page.

## Rabbit holes

- **Don't display the full jobId by default**. Truncated + behind a
  toggle is fine; full UUID in the user's face is debugging output, not
  product UX.
- **Don't add a "search other devices" feature**. We don't have one. Don't
  imply we do.
- **Don't wire this into the `WrapViewer`'s existing 404 copy by trying to
  render the `WrapViewer` with no wrap**. Make a separate component; the
  states are conceptually different (`WrapViewer` is "I have a wrap", this
  is "no wrap exists locally").
- **Don't try to rehydrate the pending row** if the server returns 404. The
  server is the source of truth on whether a job exists; if it's gone, the
  pending row is dead.

## No-gos

- Sync wraps across devices.
- Server-side wrap storage of any kind. The whole privacy framing depends
  on wraps living locally.
- Adding a "request from server" recovery button. There's no server copy
  to recover from.
- Showing the user's last wrap as a fallback. Subtle but bad — they came
  here for a specific id; show them the right thing or nothing.

## Verification

- **Component test**: `<WrapNotFound jobId="abc-123" />` renders the copy,
  the button, and (when toggled) the truncated jobId.
- **Page test** (or e2e): navigate to `/wrap/<random-uuid>` with no local
  state for that id; assert the `WrapNotFound` panel renders and **no
  network request** went out (use MSW to spy).
- **Pending → 404 path test**: seed a local `pendingWrapRequests` row, mock
  the server to return 404, run the polling hook, assert the row is removed
  AND the page transitions to `WrapNotFound` (not `phase: 'failed'`).

## Notes

- `src/app/wrap/[id]/page.tsx` — current routing.
- `src/components/wrap/PendingWrapView.tsx` — existing pending UI.
- `src/components/wrap/WrapViewer.tsx` — existing wrap rendering.
- `src/components/slides/SlideFrame.tsx` — shared frame to reuse.
- `src/lib/local-store/hooks.ts:97-100` — the spot where `pollWrap`
  currently removes the pending row + propagates `failed: not-found`.
- Coordinates with spec 11 (paused polling) and spec 10 (cancel) — all
  three touch the polling hook. Land them in any order; merge conflicts
  are minor.
