# Spec 10 — Stuck `running` job recovery

**Status**: Shaped — ready to pick up
**Branch**: both (server timer + new DELETE endpoint; client UI + cancel call)
**Appetite**: medium (≤ 3 days)
**Last shaped**: 2026-05-09

## Problem

If the worker dies after marking a job `running` but before persisting a
terminal status, the job sits at `running` forever. With the #4 fix in place
the Service Bus delivery-count cap and idempotency catch most cases — but
when the message is acked AND the worker dies, redelivery never happens. The
client polls `running` in a loop with no escape. The user has no way to
abandon the wrap and try again.

This is the single biggest failure-mode the wrap flow has today: there's no
floor on how stuck a user can get, and no affordance for them to recover.

## Solution shape

Two complementary moves:

### Server-side: TTL sweeper

A new timer-triggered Function in `server/src/functions/`, runs every 5
minutes. The sweeper handles three classes of orphaned rows:

1. **Stuck `running` jobs.** Scan `wrapJobs` for rows with
   `status='running'` AND `updatedAt < now - 5min` and mark them `failed`
   with `errorCode='stalled'` using the existing ETag-guarded
   `updateJobRow` (so it can't clobber a worker that's mid-flight on its
   own row).
2. **Stale lookup rows.** Scan the `__lookup__` partition (#7) for rows
   with `createdAt < now - 24h` and delete them. A lookup row outlives
   the job it points at if `wrapGet` was never called for the terminal
   status (e.g. user closed the tab and never came back). 24h matches
   the `WRAP_RESULT_TTL_HOURS` default and gives plenty of headroom over
   the 5min running-job TTL.
3. **TTL'd result rows.** Scan `wrapResults` (per-install partitions
   after #8) for rows with `createdAt < now - WRAP_RESULT_TTL_HOURS` and
   delete them. The env var was wired in `concurrency.ts` but never
   enforced; this is where it gets enforced.

5 minutes is a soft floor for the running-job TTL — generation today
takes ~20s, so anything past 5min is definitely stuck. If we ever get a
model that legitimately takes 5min, revisit then.

### Server-side: cancel endpoint

`DELETE /wrap/{jobId}` — authenticated like the other endpoints, ownership-
scoped (404 if `installId` doesn't own the row). Marks the row `failed` with
`errorCode='cancelled'`, drops the lookup row, drops the result row if any.
Idempotent: deleting an already-deleted row returns 204.

Worker behaviour: if the worker is mid-flight and the row was cancelled, the
ETag-guarded transition to `complete` will 412 and the worker bails — already
the existing #3 behaviour. No new worker code.

### Client-side: take-too-long affordance

`PendingWrapView` adds a state `tookTooLong` that flips after `pollingFor >
60s`. UI changes from the normal spinner to a softer "still working" copy
with a "Cancel and retry" button.

Cancel: best-effort `DELETE /wrap/{jobId}`, then drop the local
`pendingWrapRequests` row, then route back to `/dashboard`. The user can
press Generate again with a new jobId.

### Mockups

Normal pending view (first ~30s):

```
┌─────────────────────────────────────────────────┐
│                                                 │
│         ✨  Generating your wrap…               │
│                                                 │
│         ●  Pulling threads from your year       │
│         ◌  Finding the patterns                 │
│         ◌  Drafting slides                      │
│                                                 │
│         Usually takes about 20 seconds          │
│                                                 │
└─────────────────────────────────────────────────┘
```

After ~60s with no progress:

```
┌─────────────────────────────────────────────────┐
│                                                 │
│         ✨  Still working…                      │
│                                                 │
│         This is taking longer than usual.       │
│         Sometimes a model is just slow.         │
│         Sometimes something's stuck.            │
│                                                 │
│         ┌─────────────────────────────────────┐ │
│         │  Keep waiting   Cancel and retry    │ │
│         └─────────────────────────────────────┘ │
│                                                 │
└─────────────────────────────────────────────────┘
```

The `●  ◌  ◌` line is **decorative**, not real progress (we don't have
per-stage signals). It's a familiar visual idiom that buys patience without
lying about state. Keep it static; do NOT animate the bullets to fake
progress.

## Rabbit holes

- **Don't derive the 60s threshold from p95**. A flat constant is fine for
  v1. The point of the threshold is "longer than the user expected" — that
  number is roughly stable across model speed.
- **Don't add real progress signals**. We don't get per-slice progress out
  of `Promise.allSettled`. Faking them erodes trust the moment the user
  notices the bullets always advance at the same rate regardless of what's
  happening. Static decorative bullets are honest; animated fake-progress
  bullets are a lie.
- **Don't auto-retry on cancel**. The user clicked cancel because they want
  out. Drop them back at the dashboard; let them drive the retry decision.
- **Don't use the worker to clean up stale rows**. The worker is for
  generation. Cleanup is the timer's job. Mixing concerns produces a worker
  that takes risks at startup.
- **Don't run the three sweeps as one big query**. They scan different
  partitions and have different age thresholds. Three small filtered
  scans — one per concern — keep each one auditable in isolation. The
  total scan cost is negligible at our row counts.
- **Don't sweep result rows whose paired job row is still in flight.**
  Result rows shouldn't outlive their job in the normal path; if they
  do (worker wrote result, then crashed before flipping status), let
  the `running` TTL surface a `failed` state first, and the next sweep
  can collect the now-orphaned result. Cleaner ordering than trying to
  reason about both at once.

## No-gos

- Heartbeat updates from the worker. Overkill for 20s generation; the 5min
  TTL doesn't need finer-grained writes to be safe.
- Per-slice progress reporting. Architecturally interesting, completely out
  of scope for this fix.
- A general "jobs admin" surface. We're solving stuck jobs for the user, not
  building observability tooling.
- Telemetry / metrics for stalled-job rates. Useful eventually, separate
  spec.

## Verification

- **Server unit test (running TTL)**: timer marks `running` rows older
  than 5min as `failed` with `errorCode='stalled'`; younger rows
  untouched; ETag race with a live worker → timer's update 412s and is
  silently swallowed.
- **Server unit test (lookup-row TTL)**: lookup rows older than 24h are
  removed; younger rows untouched; lookup rows whose paired job row is
  still in flight (status `queued` or `running`) are NOT removed even if
  past 24h — they're tied to their job's lifetime, not their own age.
- **Server unit test (result-row TTL)**: result rows older than
  `WRAP_RESULT_TTL_HOURS` are removed; verify the env var is read each
  invocation (not cached at module load) so changes take effect on next
  sweep.
- **Server integration test**: `DELETE /wrap/{jobId}` from an authenticated
  install marks the row failed and drops the result + lookup rows. From a
  different install: 404. Twice in a row from the owner: 204 then 204.
- **Client e2e**: simulate a server that hangs on `GET /wrap/{jobId}` for
  >60s; assert the UI rolls into the "still working" copy and exposes the
  cancel button. Click cancel → row removed locally → routed to dashboard.

## Notes

- Depends on the lookup-row cleanup added in commit `a895064` (#7).
- The DELETE endpoint should reuse the same install-token middleware as
  `wrapEnqueue` / `wrapGet` and follow the same `safeError` patterns.
- The result-row TTL portion enforces `WRAP_RESULT_TTL_HOURS` from
  `concurrency.ts:15-17`, which today is read but never used.
- Spec 1 (data-loss when idle-locked) interacts: with this sweeper in
  place, a result row left behind because the user idle-locked mid-poll
  gets cleaned up at 24h. That's the safety net — the primary fix is
  spec 1 making sure the result is fetched + persisted in the first
  place.
- Spec 11 (pause polling) lands cleanly alongside this — they touch the
  same `usePendingWrap` hook but don't conflict.
- A future spec could add server-side trace correlation between enqueue
  and worker (item 21 from the original critique) so stalled-job
  investigations are easier; that's separate.
