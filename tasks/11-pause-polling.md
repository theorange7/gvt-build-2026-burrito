# Spec 11 — Pause polling when hidden / offline

**Status**: Shaped — ready to pick up
**Branch**: client
**Appetite**: small (≤ 1 day; realistically ~3 hours)
**Last shaped**: 2026-05-09

## Problem

The polling hook in `src/lib/local-store/hooks.ts` (`usePendingWrap`)
schedules `setTimeout` unconditionally. A user who leaves the wrap tab open
while their laptop sleeps for 8 hours generates ~3,000 useless polls when
they wake up. Same shape with offline: the hook keeps polling against a
network that isn't there, each call rejected, the failure handler eats CPU
and inflates error rates.

The cost of the bug is mild but the fix is cheap and the bug is universal —
every modern web app handles this; we should too.

## Solution shape

Refactor the polling loop in `usePendingWrap` to listen to two browser
events and short-circuit the timer when either condition makes polling
pointless.

- `document.visibilityState === 'hidden'` → pause.
- `navigator.onLine === false` → pause.
- On `visibilitychange` to `'visible'` AND `online` event → resume.
- On resume, **poll immediately** (don't wait the next interval). The user
  came back to the tab to see if it's done — make it feel like it is.

Both event listeners attach in a `useEffect`, clean up on unmount. The
existing setTimeout-based interval gets wrapped so that scheduling skips
when paused and a separate "wake" trigger fires the immediate poll on
resume.

### Default UX: silent pause

No UI change. When the tab returns or the network is back, the spinner is
still there; if the wrap is ready by then, it appears. The user thinks
"huh, fast" and moves on. This is what GitHub, Linear, Slack do.

### Optional UX: visible offline banner

If during shaping you decide we want users to know we noticed they're
offline, surface this **only** for the offline case (not the
visibility-hidden case — the user can't see the UI anyway):

```
┌─────────────────────────────────────────────────┐
│  ⓘ  Offline — we'll pick this up when you're    │
│     back online.                                 │
└─────────────────────────────────────────────────┘
│                                                 │
│         ✨  Generating your wrap…               │
```

Default to silent. Add the banner only if user testing surfaces confusion
("why isn't it loading?"). Don't add it pre-emptively.

## Rabbit holes

- **Don't show a "tab hidden" indicator** even when the tab is hidden — the
  user already knows they switched tabs, telling them again is noise.
- **Don't bump up the polling interval when offline**. Just pause. Adaptive
  backoff sounds clever but adds state and edge cases for no real win.
- **Don't replace `setTimeout` with `setInterval`**. The current backoff
  (2s → 4s → 8s, capped at 10s) is a feature; preserve it. Refactor the
  scheduling, not the timing strategy.
- **Don't treat `visibilitychange` as a refresh trigger** for state that
  isn't pending. We're only managing the polling loop, not pushing a global
  "refetch everything" signal.

## No-gos

- WebSocket / Server-Sent Events upgrade. Out of scope; that's a different
  spec.
- Optimistic prefetch on focus (e.g. start a poll before the timer would
  fire just because the tab is visible). The "poll immediately on resume"
  rule already covers this.
- Cross-tab coordination via `BroadcastChannel`. Pending wraps are
  per-jobId; if the user opens two tabs they both poll, that's fine.

## Verification

- **Unit / hook test**: render `usePendingWrap`, fake `document.visibilityState`
  to `'hidden'`, advance fake timers — assert no fetch happened. Flip to
  `'visible'` — assert one fetch fires immediately.
- **Same shape for `online`/`offline`**: dispatch the events, assert pause
  / resume.
- **Backoff preserved**: across normal (non-paused) ticks, the interval
  should follow the existing 2s → 4s → 8s → 10s schedule.

## Notes

- Touches the same hook as spec 10 — coordinate the two so the
  "tookTooLong" timer in spec 10 only counts elapsed *active* polling time,
  not wall-clock time. Otherwise a user who closes their laptop for an
  hour will see "still working" the moment they reopen, which is
  disorienting.
- `src/lib/local-store/hooks.ts:113-117` is the exact location.
