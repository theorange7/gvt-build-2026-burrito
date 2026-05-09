# Spec 1 — Polling-success data loss when idle-locked

**Status**: Shaped — ready to pick up
**Branch**: client (with optional small server-side companion noted below)
**Appetite**: small (≤ 1 day; realistically ~half day)
**Last shaped**: 2026-05-09
**Severity**: P0 — silent permanent data loss

## Problem

The polling-success path in `src/lib/local-store/hooks.ts` (`usePendingWrap`)
loses the wrap entirely when the encryption key is gone at the moment the
client tries to persist it locally.

The exact bad sequence:

1. User clicks Generate. Client enqueues, navigates to `/wrap/{jobId}`.
   Polling loop starts.
2. Worker runs (~20s). Server marks the row `complete` and writes the
   result row.
3. Client polls. Server returns `sliceContent` and **deletes both the
   result row and the job row** on first read (`wrapGet.ts:38-45`). This
   is intentional — the server is supposed to forget once the client has
   the data.
4. Client receives the response, calls `saveWrap()`. **But the idle-lock
   has fired during the 15+ minutes the user was waiting** (`crypto.ts:14`,
   default lock-after-idle).
5. `saveWrap` requires the in-memory passphrase-derived key. With the
   store locked, it throws.
6. The client has lost the wrap. The server has already dropped its copy.
   No recovery — the user has to regenerate from scratch and the
   contributions / model spend is wasted.

This is the worst-failure mode in the polling flow: the user does
everything right, the system completes successfully, and the result silently
evaporates. There's no error toast that explains it; the polling hook just
flips to `phase: 'failed'`.

## Solution shape

Two complementary fixes. Land both — they reinforce each other.

### Client-side: don't poll while locked

Before scheduling the next poll, check `hasActiveKey()`. If the key is
gone, **pause polling** instead of fetching. When the user unlocks (a
known event — `UnlockGate` already broadcasts it), resume polling
immediately.

This means the server doesn't get a `GET /wrap/{jobId}` while the client
is in no state to handle a `complete` response. The result row + job row
stay put on the server side; whenever the user unlocks, the next poll
fetches the still-intact wrap and `saveWrap` succeeds.

Concrete shape in `usePendingWrap`:

- New state: `phase: 'paused-locked'`.
- On every scheduled tick, check `hasActiveKey()` first.
  - If false: don't fetch; flip to `paused-locked`; subscribe to the
    unlock event.
  - If true: proceed as today.
- On unlock event (or `visibilitychange` to visible — coordinate with
  spec 11): immediately re-evaluate, transition out of `paused-locked`,
  poll once.

UI: while `paused-locked`, the `PendingWrapView` shows the existing
"unlock to continue" copy that `UnlockGate` uses. The user enters their
passphrase; polling resumes. No new component.

### Server-side companion (optional, recommended)

The client-side check is the primary fix, but it has a window: a
client-side bug, a tab killed mid-`saveWrap`, or any edge case that
calls `pollWrap` while the key is gone still drops the result.

To close that window, add an explicit ACK step on the server:

- `wrapGet.ts` returns `sliceContent` but **does not delete** the result
  row on first read. It returns `{status: 'complete', sliceContent}`.
- New endpoint `POST /wrap/{jobId}/ack` — client calls this **after**
  `saveWrap` succeeds. The server then deletes the result row, job row,
  and lookup row.
- Result rows that are never ACKed get cleaned up by the TTL sweeper
  (spec 10) at 24h.

This is a meaningfully bigger change and not strictly required if the
client-side check is implemented carefully. Treat it as a follow-up:
**ship the client-side fix first**, monitor for any reports of lost
wraps, and add the ACK endpoint if data still slips through.

## Rabbit holes

- **Don't try to "extend the idle-lock window" while polling is active.**
  That couples the security model (lock after N minutes idle) to network
  state, which is a bad trade. Pause polling instead.
- **Don't poll once and cache the response client-side until unlock.**
  Same trap: now the wrap is sitting in memory + the server's already
  dropped its copy, and a tab refresh loses it. Holding the encrypted
  bytes in plain memory also breaks the at-rest invariant.
- **Don't auto-prompt for the passphrase from the polling hook.** The
  unlock UI is `UnlockGate`'s job; the polling hook just waits.
- **Don't silently retry indefinitely** — if the user explicitly closes
  the unlock prompt, surface the `<WrapNotFound>` panel (spec 13) with
  the option to start over. Otherwise we have a phantom pending row
  forever.

## No-gos

- Storing the key on disk (kill-switch removal of idle-lock).
- Server-side persistence of wraps "just in case" — kills the local-first
  framing.
- Migrating to a push model (WebSocket / SSE) to avoid polling entirely.
  Out of scope; the polling architecture stays.
- Coupling this to the model TTL — the result-row TTL is operational
  hygiene; this fix is about correctness.

## Verification

- **Hook test**: render `usePendingWrap` with the store locked; advance
  fake timers — assert no `fetch` happened, phase is `paused-locked`.
- **Hook test**: with the store locked, simulate the unlock event;
  assert one `fetch` fires immediately and `phase` transitions out.
- **Integration test**: full flow — enqueue, lock the store mid-wait,
  assert pollWrap doesn't drain the server side. Unlock, assert the
  pending row eventually persists locally.
- **Canary**: a deliberately-failing `saveWrap` (mock the encryption to
  throw) should NOT result in the server-side row being deleted. The
  pending row should remain pollable. (Validates: client only drains
  the server *after* it can guarantee local persistence.)
- **E2E**: simulate a 16-minute polling wait by advancing the idle-lock
  clock; assert the `PendingWrapView` shows the unlock prompt rather
  than `phase: 'failed'`.

## Notes

- `src/lib/local-store/hooks.ts:80-92` — the call site that lost wraps.
- `src/lib/local-store/crypto.ts:14` — `IDLE_LOCK_MS`, the existing 15min
  default.
- `src/lib/local-store/crypto.ts` — `hasActiveKey()` is already exported;
  this spec uses it as-is.
- `src/components/unlock/UnlockGate.tsx` — already broadcasts an unlock
  event; reuse rather than wire a new one.
- Coordinates with **spec 11** (paused polling for hidden / offline) —
  both add `paused-*` states to `usePendingWrap`. Implement them together
  if scheduling allows; otherwise the second one rebases over the first
  trivially. Same with **spec 5** (transient vs terminal — folded into
  spec 11's "Notes").
- The server-side ACK companion would touch `wrapGet.ts`, add a new
  `wrapAck.ts` Function, and update `wrapEnqueue` to skip ACK-pending
  rows from `countInflight`. Save it for a follow-up spec.
