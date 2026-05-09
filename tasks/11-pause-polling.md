# Spec 11 — Pause polling when hidden / offline (+ transient-error handling)

**Status**: Shaped — ready to pick up
**Branch**: client
**Appetite**: small (≤ 1 day; realistically ~half day with the transient-error portion)
**Last shaped**: 2026-05-09 (revised 2026-05-09 to absorb item #5)

## Problem

Two related issues in the same polling loop in
`src/lib/local-store/hooks.ts` (`usePendingWrap`):

**Polling never pauses.** The hook schedules `setTimeout` unconditionally.
A user who leaves the wrap tab open while their laptop sleeps for 8 hours
generates ~3,000 useless polls when they wake up. Same shape with offline:
the hook keeps polling against a network that isn't there, each call
rejected, the failure handler eats CPU and inflates error rates.

**Transient errors are treated as terminal.** A wifi blip during polling
makes `fetch` reject. Today (`hooks.ts:106-110`), that flips the state
to `phase: 'failed'` and the pending row is left dangling — the failure
path doesn't `removePendingWrap`. The user has to refresh to recover, and
a generation that the server is still happily working on shows up as
"failed" client-side.

The two issues live in the same loop and the fix for both is shaped by
the same retry / pause logic. Bundling them into one spec.

## Solution shape

### Pause on hidden / offline

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

### Distinguish transient from terminal errors

Replace the blanket `phase: 'failed'` on every fetch error with a
classifier:

```ts
function isTransientPollError(err: unknown): boolean {
  // Network reject (TypeError 'Failed to fetch'), abort, navigator offline
  if (err instanceof TypeError) return true;
  // 5xx from the server — server is up but unhappy; retry
  const status = (err as { status?: number })?.status;
  if (typeof status === 'number' && status >= 500 && status < 600) return true;
  // Explicit 408 / 504 timeouts
  if (status === 408 || status === 504) return true;
  return false;
}
```

Loop behaviour:

- **Transient error** → log at debug level, schedule the next poll with
  the existing backoff (2s → 4s → 8s, capped at 10s). Pending row stays.
  No state change.
- **Terminal failure** (server-issued `{status: 'failed'}`) → flip to
  `phase: 'failed'`, surface error code, remove pending row. Same as
  today's terminal path.
- **Server 404** (job no longer exists) → drop the pending row and route
  into `<WrapNotFound>` (this is the case spec 13 owns; coordinate with
  that spec so both classifiers agree on the shape).
- **Auth 401 / 403** → terminal; surface unlock prompt OR re-register
  flow. Don't retry on bad creds.

Tie it together: an unbounded retry on transient errors is worse than the
current bug — a permanently-disconnected server would loop forever. Cap
transient-retry attempts at, say, 30 (= ~5 minutes at the maxed 10s
interval) before treating as terminal with `errorCode='unreachable'`.

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
- **Don't catch every network error as transient**. A `CORS` failure or a
  certificate issue *looks* like a `TypeError: Failed to fetch` but isn't
  going to recover by retrying. Log at debug, retry up to the cap, then
  surface terminal — same flow as a normal disconnect. The cap is the
  safety net.
- **Don't conflate the `paused-locked` state from spec 1 with the
  `paused-hidden`/`paused-offline` states here.** They have different
  resume triggers (unlock event vs visibility/online). Model them as
  separate flags on the same hook; the loop only polls when **all** of
  them say "go."

## No-gos

- WebSocket / Server-Sent Events upgrade. Out of scope; that's a different
  spec.
- Optimistic prefetch on focus (e.g. start a poll before the timer would
  fire just because the tab is visible). The "poll immediately on resume"
  rule already covers this.
- Cross-tab coordination via `BroadcastChannel`. Pending wraps are
  per-jobId; if the user opens two tabs they both poll, that's fine.

## Verification

### Pause / resume

- **Unit / hook test**: render `usePendingWrap`, fake
  `document.visibilityState` to `'hidden'`, advance fake timers — assert
  no fetch happened. Flip to `'visible'` — assert one fetch fires
  immediately.
- **Same shape for `online`/`offline`**: dispatch the events, assert
  pause / resume.
- **Backoff preserved**: across normal (non-paused) ticks, the interval
  should follow the existing 2s → 4s → 8s → 10s schedule.

### Transient vs terminal classification

- **Hook test (transient)**: stub `fetch` to reject with
  `TypeError('Failed to fetch')`; assert the pending row remains, the
  hook stays in a `polling` state, the next attempt is scheduled.
- **Hook test (5xx)**: stub `fetch` to resolve `{ status: 503 }`; same
  expectations as the transient test.
- **Hook test (terminal `failed`)**: stub `fetch` to resolve
  `{ status: 200, body: { status: 'failed', error: 'upstream_5xx' } }`;
  assert the pending row is removed and the hook surfaces the
  `errorCode`.
- **Hook test (404)**: stub `fetch` to resolve 404; coordinate with
  spec 13 — assert the pending row is dropped and the surfaced state is
  the same `not-found` shape that `<WrapNotFound>` consumes.
- **Hook test (transient cap)**: with `fetch` permanently rejecting,
  advance fake timers far enough to exhaust the 30-attempt cap; assert
  the hook eventually flips to `phase: 'failed'` with
  `errorCode: 'unreachable'`.
- **No-CORS canary**: assert that a `CORS`-shaped failure is *also*
  treated as transient initially (matches the cap path) — we accept the
  occasional "5 min loop on a misconfigured browser" as the cost of not
  building a CORS-detection heuristic.

## Notes

- This spec absorbs the original code-review item #5 (transient errors
  treated as terminal). They live in the same hook and share a retry
  schedule; splitting them was artificial.
- Touches the same hook as **spec 10** — coordinate the two so the
  "tookTooLong" timer in spec 10 only counts elapsed *active* polling
  time, not wall-clock time. Otherwise a user who closes their laptop
  for an hour will see "still working" the moment they reopen, which is
  disorienting.
- Coordinates with **spec 1** (idle-locked pause) — both add `paused-*`
  states. The hook's "should I poll right now" predicate is an AND of
  all the pause flags. Implement spec 1 first if scheduling allows;
  otherwise either order works — the merges are mechanical.
- Coordinates with **spec 13** (graceful wrap-not-found) — the 404
  branch in the classifier above is exactly the case spec 13 owns; share
  one helper rather than re-classifying in two places.
- `src/lib/local-store/hooks.ts:106-110` (transient classifier site),
  `:113-117` (interval scheduler).
