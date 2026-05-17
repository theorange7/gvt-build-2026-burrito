# Spec 62 — GitLab sync throttling and call visibility

**Status**: Shaped — ready to pick up
**Branch**: client
**Appetite**: small (≤ 1 day)
**Last shaped**: 2026-05-14

## Problem

`runEvents` in `gitlab-dedicated/sync.ts` fires paginated GitLab API requests
in a tight `while` loop with no delay between pages. For a user with a large
event history, this is dozens of consecutive requests fired as fast as the
network allows. Two things are missing:

1. **Throttling** — no inter-page delay, no respect for `RateLimit-Remaining`
   or `Retry-After` headers. The client hammers the GitLab instance until
   pagination is exhausted or GitLab rate-limits it.

2. **Visibility** — there is no counter, log, or progress signal for how many
   API calls a sync has made. A long sync is invisible: the caller gets one
   `SyncResult` at the end and nothing in between.

## Solution shape

Two independent changes, both inside the client-side provider layer.

### 1. Inter-page delay + rate-limit header respect (`sync.ts` + `client.ts`)

Add a `sleep` between pages in `runEvents`. Default: **300 ms** — enough to
be a considerate client without making a 10-page sync feel slow.

Also parse two GitLab rate-limit headers on every response:

- **`RateLimit-Remaining`**: remaining requests in the current window. If this
  drops to ≤ 5, pause until `RateLimit-Reset` (epoch seconds in the header)
  before issuing the next request. This is a proactive pause, not a
  recovery.

- **`Retry-After`** on a `429 Too Many Requests`: `client.ts` currently throws
  `ProviderTransientError` on 5xx but does not handle 429 at all — it falls
  through to the generic `throw new Error(...)`. Fix `gitlabFetch` to throw a
  `ProviderRateLimitError` (new subclass of `ProviderTransientError`) carrying
  the parsed `Retry-After` seconds. In `runEvents`, catch this, sleep for the
  indicated duration (capped at 60s), and retry the same page once before
  propagating.

```
while (page !== null) {
  await sleep(INTER_PAGE_DELAY_MS);           // always wait before next call
  response = await gitlabFetch(...)            // may throw ProviderRateLimitError
  checkRateLimitHeaders(response.headers)      // proactive pause if nearly exhausted
  yield events...
  page = parseNextPage(response.headers)
}
```

`INTER_PAGE_DELAY_MS = 300` — a module-level constant, not configurable at
call time. If tuning is needed later, change the constant.

### 2. Per-page progress callback (`types.ts` + `sync.ts` + `orchestrator.ts`)

Add an optional `onProgress` callback to `SyncAdapter.run`'s args:

```typescript
onProgress?: (progress: SyncPageProgress) => void;

type SyncPageProgress = {
  page: number;           // 1-based page number just completed
  callsMade: number;      // cumulative calls this sync run
  eventsReceived: number; // cumulative raw events yielded so far
  rateLimitRemaining: number | null; // from last RateLimit-Remaining header
};
```

`runEvents` calls `onProgress` after each page with the current accumulator.

The orchestrator threads it through in `syncIdentity`:

```typescript
export async function syncIdentity(
  identityId: string,
  options: {
    signal?: AbortSignal;
    onProgress?: (progress: SyncPageProgress) => void;
  } = {},
): Promise<SyncResult>
```

Additionally, `syncIdentity` accumulates the final totals and persists them
to `syncState` alongside the existing cursor and last-error fields:

```typescript
// new fields on the syncState row (additive, no migration needed — optional fields)
callsMadeLastSync: number;
eventsReceivedLastSync: number;
pagesLastSync: number;
lastSyncDurationMs: number;
```

This gives any future UI surface (settings panel, debug view) access to the
last sync's call volume without needing to instrument the UI directly.

## Rabbit holes

- **Don't make `INTER_PAGE_DELAY_MS` a provider config option.** One constant
  in the module is enough for v1. Per-instance tuning is premature.
- **Don't retry more than once on 429.** If the retry also hits a 429,
  propagate `ProviderRateLimitError` up — the orchestrator already records
  `lastError` in syncState. The user can retry the sync manually.
- **Don't add a `RateLimit-Remaining` threshold to the public API surface.**
  The check and pause are an internal implementation detail of `sync.ts`,
  not part of the `SyncAdapter` contract.
- **Don't change `backfillIdentity` in this spec.** Backfill also calls
  `provider.sync.run` and would benefit from throttling, but it's a separate
  flow and the inter-page delay in `sync.ts` applies automatically since it's
  in the runner — backfill gets throttling for free.
- **Don't add a UI progress bar in this spec.** The `onProgress` callback and
  syncState fields are the foundation; surfacing them in the UI is a follow-up.

## No-gos

- No configurable delay per-provider or per-call-site.
- No server-side metrics endpoint — the stats live in local `syncState` only.
- No changes to `backfillIdentity`'s call signature.
- No retry loop beyond the single 429 retry.

## Verification

**Throttle — unit tests (`sync.ts`):**
- A 3-page sync calls `sleep` exactly 3 times with `INTER_PAGE_DELAY_MS`.
- If `RateLimit-Remaining: 3` is returned on page 2, the runner sleeps until
  the `RateLimit-Reset` timestamp before fetching page 3.
- A 429 response on page 2 causes a single retry of the same page after
  `Retry-After` seconds; on success the sync continues; on second 429 the
  error propagates.

**Rate-limit header parsing — unit tests (`client.ts`):**
- `gitlabFetch` on a 429 response throws `ProviderRateLimitError` with
  `retryAfterSeconds` populated from the `Retry-After` header.
- `gitlabFetch` on a 429 with no `Retry-After` header sets
  `retryAfterSeconds = 30` (safe default).

**Progress callback — unit tests (`orchestrator.ts`):**
- `syncIdentity` with an `onProgress` callback: callback is invoked once per
  page, `callsMade` and `eventsReceived` are strictly increasing, `page` is
  1-based.
- After sync completes, `getSyncState(identityId)` returns
  `callsMadeLastSync`, `pagesLastSync`, and `lastSyncDurationMs` with
  non-zero values.

**Regression:**
- All existing `gitlab-dedicated` sync and normalise unit tests pass
  unchanged (throttle is transparent to callers that don't pass `onProgress`).

## Notes

- `parseNextPage` in `client.ts` already reads response headers; parsing
  `RateLimit-Remaining` and `RateLimit-Reset` there alongside it keeps all
  header logic in one place. Export a `parseRateLimitHeaders(headers): { remaining: number | null, resetAt: number | null }` helper.
- The `syncState` schema addition is additive — existing rows without the new
  fields will return `undefined` for them; no migration needed.
- Follow-up: expose `callsMadeLastSync` + `pagesLastSync` in the settings UI
  so the user can see the footprint of their last sync without opening devtools.
- Follow-up: apply the same throttle pattern to `backfillIdentity` explicitly
  once the pattern is proven in `syncIdentity`.
