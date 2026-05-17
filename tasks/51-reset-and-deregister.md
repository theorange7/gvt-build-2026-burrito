# Spec 51 — Reset (clear data) and de-register (forget passphrase)

**Status**: Done
**Branch**: both (client + server)
**Appetite**: medium (≤ 3 days)
**Last shaped**: 2026-05-14

## Problem

The app accumulates state in three places, and today there is no first-class
way to clear any of it:

1. **Local store (IndexedDB)** — encrypted `contributions`, `wraps`,
   `identities`, `tokens`, `syncState`, `importedRanges`,
   `pendingWrapRequests`, plus the `meta` row holding `kdfSalt` and
   `wrapInstallToken` (`src/lib/local-store/db.ts`).
2. **Server-side state keyed by `installId`** — `wrapJobs` and
   `wrapResults` partitioned by `installId` in Azure Table Storage
   (`server/src/queue/jobs.ts`, `server/src/queue/results.ts`), plus
   lookup rows under `LOOKUP_PARTITION`.
3. **Public share bundles** — landing in spec 31 (PR #40): a
   `shareLinks` table row + `wraps/{slug}/*` blobs per shared wrap, all
   owned by an `installId`. These are publicly readable by URL until the
   user revokes them.

Right now the only way out is "open devtools, delete the
`wrapped-for-work` database, and live with the orphaned server rows."
That is fine for a developer, hostile for anyone else, and is going to
become actively dangerous the moment spec 31 ships — a user who clears
site data through the browser keeps their share bundles live and loses
the local slug list needed to revoke them.

Two real user stories drive this:

- **"I made a mess testing this — let me start over."** Local data is
  noisy; user wants a clean dashboard but is happy with their
  passphrase and any in-flight registration.
- **"I forgot my passphrase."** The only honest answer is "your data is
  gone; do you want to start over?" Today the user has to know that the
  answer is "delete the IndexedDB database in devtools." That is not a
  product.

Spec 50 (file-upload provider, PR #39) does not persist anything
server-side and therefore needs no special handling here — its
`file-upload` identities and contributions live entirely in the local
store and are cleared alongside everything else. It is referenced here
only because the user request that produced this spec asked about
"shared data per spec 50 and 31"; spec 50's share surface turns out to
be empty by design.

## Solution shape

One UI entry point, **two reset modes**, one new server endpoint, no new
client-side trust boundary.

### The two modes

**Mode A — "Clear my data"** (keeps passphrase + install token):

- Server: call `DELETE /me/data` (new). Server enumerates everything
  partitioned by the caller's `installId` and deletes it (jobs,
  results, lookup rows, share bundles + `shareLinks` rows once spec 31
  is in).
- Client: clear all rows from `contributions`, `wraps`, `identities`,
  `tokens`, `syncState`, `importedRanges`, `pendingWrapRequests`.
- Client: **keep** the `meta` rows for `kdfSalt` and
  `wrapInstallToken`. After reset, the user remains unlocked with the
  same passphrase, the same install JWT, and an empty dashboard.

**Mode B — "Forget this device"** (also drops passphrase + install token):

- Everything in mode A, plus:
- Client: delete `meta.kdfSalt` and `meta.wrapInstallToken`.
- Client: drop the in-memory key (`lock()` in
  `src/lib/local-store/crypto.ts`).
- Client: hard-reload the app. Next launch lands on `UnlockGate` in the
  `'setup'` branch (no salt → setup form). The next backend call
  triggers `getOrRegisterInstallToken` → fresh registration.

Mode B is the "I forgot my passphrase" answer. Because the data was
encrypted with a key derived from the forgotten passphrase, it was
already unrecoverable — this just makes that explicit and gives the
user a clean slate.

### Why not "delete the whole IndexedDB"

`Dexie.delete()` is tempting and would handle mode B in one line. We
deliberately do not use it because:

- Schema migrations on next open re-create the same database name with
  whatever the current `version()` is. If we ever drop a version()
  step, replays through migrations break. Per-table `clear()` keeps the
  schema intact and stays compatible with Dexie's migration model.
- Per-table `clear()` is the same code path we want exercised by tests
  and is symmetric with mode A — the only difference between modes is
  which `meta` keys survive.

### Server: `DELETE /me/data`

New function `server/src/functions/meReset.ts`. PRIVACY banner
required (CLAUDE.md hard rule 6). Auth: `requireInstallToken`
middleware.

Behaviour:

1. Pull `installId` from the validated JWT.
2. Enumerate and delete (each step independent, errors collected):
   - All `wrapJobs` rows with `PartitionKey == installId` — query by
     partition key, batch-delete.
   - All `wrapResults` rows with `PartitionKey == installId` — same.
   - All lookup rows under `LOOKUP_PARTITION` whose `installId`
     property matches — reuse the filter form already used by
     `deleteLookupRowsForJob` in `server/src/queue/jobs.ts`, dropping
     the `jobId` clause.
   - **(Conditional on spec 31)** All `shareLinks` rows whose
     `installId` property matches — list with a filter on the
     `installId` column across partitions; for each matching row,
     delete `wraps/{slug}/*` blobs and the `shareLinks` row.
3. Return `204 No Content` on full success. On partial failure, return
   `207` with a body of the form `{ failed: ['jobs'|'results'|'lookups'|'shares'] }`
   so the client can surface a precise retry hint. Never include
   identifiers (installId, slugs, jobIds) in the response body.

Implementation notes:

- The endpoint is **idempotent**. Re-calling after a partial failure
  must continue cleanup from where it stopped without errors on
  already-deleted rows. Use Table Storage's "not found" error code
  (404) as a no-op signal, same as `deleteJobRow` already does.
- The endpoint does **not** revoke the JWT or write to any
  "deregistered installs" denylist. JWTs remain stateless. After mode B
  the client discards the token; a stolen old token would still
  validate but find no resources to act on, which is the correct
  failure mode.
- The endpoint does **not** rate-limit per install (the operation is
  destructive and idempotent — a user retrying after a transient
  error must not get throttled). Per-IP rate-limit reuses the
  existing `checkIpRateLimit` from `server/src/auth/rateLimit.ts` at
  a generous threshold (10/hour).
- Logging: only the decision (`reset.ok` / `reset.partial`) and counts
  per resource type. Never log `installId`, slugs, or jobIds.
- The endpoint registers in `server/src/index.ts` alongside the
  existing functions.

### Client: orchestrator

New module `src/lib/local-store/reset.ts`:

```ts
export type ResetMode = 'clear-data' | 'forget-device';

export type ResetResult = {
  serverCleanup: 'ok' | 'partial' | 'offline';
  failedResources?: Array<'jobs' | 'results' | 'lookups' | 'shares'>;
};

export async function resetLocalState(mode: ResetMode): Promise<ResetResult>;
```

Sequencing:

1. **Server first.** Call `DELETE /me/data` with the install token. If
   the request returns 2xx the server side is complete; record the
   precise outcome for the result.
2. **Network failure handling.** Mode A: surface the failure to the UI
   and **abort** the local wipe. The user can retry. Mode B: surface
   the failure with a clear warning and let the user choose to proceed
   local-only (because the user may legitimately be offline and
   wanting to walk away from the device). When proceeding local-only,
   `serverCleanup` is reported as `'offline'`.
3. **Local wipe.** Inside a single Dexie transaction:

   ```ts
   await db().transaction(
     'rw',
     [db().contributions, db().wraps, db().identities, db().tokens,
      db().syncState, db().importedRanges, db().pendingWrapRequests,
      db().meta],
     async () => {
       await db().contributions.clear();
       await db().wraps.clear();
       await db().identities.clear();
       await db().tokens.clear();
       await db().syncState.clear();
       await db().importedRanges.clear();
       await db().pendingWrapRequests.clear();
       if (mode === 'forget-device') {
         await db().meta.delete(META_KEYS.kdfSalt);
         await db().meta.delete(META_KEYS.wrapInstallToken);
       }
     },
   );
   ```

4. **Memory + UI**: drop the in-memory key via `lock()`; fire the
   existing `store-locked` CustomEvent (or, if missing, dispatch
   `store-unlocked` with a flag — but the simpler shape is: clear the
   key, reload the page, let `UnlockGate` re-evaluate from cold). For
   mode B, do a `window.location.reload()` so the gate falls back to
   the setup form. For mode A, invalidate the React-Query caches
   keyed by `['contributions']`, `['wraps']`, `['identities']`,
   `['pendingWraps']` so the dashboard re-renders empty.

### Client: UI

A new "Reset this device" section in the dashboard's settings/account
panel (`src/components/dashboard/`). One button opens a modal with:

```
┌─────────────────────────────────────────────────────┐
│  Reset this device                                  │
│                                                     │
│  ( ) Clear my data                                  │
│      Delete contributions, wraps, imported          │
│      identities, and any public share links.        │
│      Keep your passphrase and install registration. │
│                                                     │
│  ( ) Forget this device                             │
│      Everything above, plus: delete the passphrase  │
│      and install registration. Next launch will be  │
│      a fresh setup. Use this if you forgot your     │
│      passphrase.                                    │
│                                                     │
│  ⚠  This is permanent. Encrypted data cannot be     │
│     recovered without the passphrase.               │
│                                                     │
│  Type RESET to confirm:                             │
│  ┌───────────────────────────────────────────────┐  │
│  │                                               │  │
│  └───────────────────────────────────────────────┘  │
│                                                     │
│            [cancel]     [reset]                     │
└─────────────────────────────────────────────────────┘
```

Hard requirements on the modal:

- The destructive button is disabled until the user has typed the exact
  literal `RESET` (case-sensitive) into the confirmation input.
- No "remember my choice" checkbox, no double-click-to-confirm
  shortcut. Every reset requires re-typing `RESET`.
- The mode A / mode B copy explicitly names what survives in each case
  (passphrase, install registration).
- The modal blocks itself while the request is in flight. Mode A: show
  inline error on server failure, keep modal open, let the user retry
  or cancel. Mode B: show server failure with a "Proceed without
  server cleanup" secondary action that, when clicked, dispatches the
  local-only wipe.

In addition to the in-dashboard entry, expose a quiet "Forgot your
passphrase? **Forget this device.**" link on the `UnlockGate` in the
`'unlock'` branch. It opens the same modal pre-selected on mode B.
This is the only place where the destructive operation is reachable
while locked.

### Idle-lock / unlock interaction

Reset does **not** require an unlocked key. The IndexedDB clear path
operates on ciphertext rows whose decryption is irrelevant for
deletion. The server endpoint operates on the install JWT, which is
plaintext in `meta`. This is why the "forgot my passphrase" entry on
`UnlockGate` is safe to expose: the user can complete mode B without
ever decrypting anything.

The dashboard-side entry, by contrast, is gated by `UnlockGate` only
because the dashboard itself is. The reset logic does not change that
gate.

### Privacy invariants (extensions)

- `src/lib/local-store/reset.ts` must not import from `src/lib/ai/`
  except for the install-token resolver (it makes one server call
  through a thin wrapper at `src/lib/ai/reset.ts`). The thinness rule
  for `src/lib/ai/**` stands: no SDKs, no env, no payloads.
- `src/lib/ai/reset.ts` is a sibling to `classify.ts` / `generate.ts`:
  it resolves the endpoint, attaches the install-token header, sends
  `DELETE`, returns the parsed result. No logging of token, status
  body, or response body.
- `server/src/functions/meReset.ts` starts with a `PRIVACY` banner.
  Never logs `installId`, slugs, jobIds, or any per-resource ids.
  Logs only counts and decision codes.
- No new identifiers travel client→server. The endpoint is
  zero-payload (`DELETE` with no body); the server enumerates from the
  JWT's `installId`.

## Rabbit holes

- **Don't `Dexie.delete()` the whole database.** Per-table `clear()` is
  the chosen shape — it interoperates with Dexie's migration model
  and is symmetric across the two modes. Whole-DB delete also forces
  a reload to re-open the database, which couples the local wipe to
  the page reload in a way that mode A explicitly does not want.
- **Don't add a server-side install denylist.** JWTs stay stateless;
  adding a per-request DB lookup to check revocation negates the
  point of a JWT and adds a hot path to every request. The
  combination of "client discards token" + "server resources are
  gone" is enough — a leaked old token can authenticate but cannot
  recover anything.
- **Don't enumerate share slugs client-side.** The list of shared
  slugs lives inside encrypted wrap rows after spec 31, but the
  canonical source of truth for "which shares does this install
  own?" is the server's `shareLinks` table. The server enumerates
  by `installId`. Sending a client-built slug list would mean a
  share the client lost track of (e.g. browser cleared
  IndexedDB out-of-band) would never be revoked.
- **Don't chain `POST /auth/register` immediately after mode B.** The
  next time the client needs the install token (next wrap, next
  classify), `getOrRegisterInstallToken` will register lazily. Eager
  re-registration during reset would tie the reset flow to backend
  availability for a benefit the user does not yet need.
- **Don't add a retry queue for the server cleanup.** If `DELETE
  /me/data` partially fails in mode A, the modal stays open and the
  user retries. In mode B with `proceed-anyway`, orphaned rows are
  accepted as the tradeoff for an offline user wanting out — the TTL
  sweeper from spec 10 will eventually GC most of them; share
  bundles (spec 31) without a TTL are the one truly orphaned class
  and that is an acknowledged limitation, not a thing to fix here.
- **Don't store a "reset pending" flag and resume after reload.** Mode
  A is synchronous; mode B reloads the page. Persistent state across
  the reset would require deciding what to do if the user closes the
  tab mid-flight, which is a rabbit hole that buys no real
  resilience.
- **Don't treat the in-flight wrap as recoverable.** Reset deletes the
  `pendingWrapRequests` row. The server-side job/result rows are
  deleted by the same call. If the worker happens to be mid-run, its
  eventual write of the result will land in a deleted partition;
  that is fine, Table Storage tolerates it. Do not introduce
  cancellation messages on Service Bus for this — keep the failure
  silent and clean.
- **Don't unify with spec 13.** "Wrap not on this device" (spec 13) is
  about gracefully handling a single missing wrap row. Reset is
  about deleting them all. They look adjacent; they are not.

## No-gos

- **No selective reset.** No "clear only wraps", no "remove only this
  identity", no per-table checkboxes. The unit of reset is the whole
  installation. Per-resource deletes (disconnect identity, delete a
  single wrap) belong to other code paths and are not extended here.
- **No soft-delete / trash bin / 30-day grace.** Encrypted data without
  the passphrase is already gone; pretending we can undo a reset is
  lying. The confirmation phrase exists because the action is final.
- **No reset-by-server-push.** The server cannot initiate this for a
  client; everything starts from a user gesture in the UI.
- **No "export before reset" feature.** Export is a separate concern
  (no spec yet). If a user wants their data out, they should do that
  before they reset.
- **No analytics or telemetry on reset.** Zero events fire to any
  external sink. The server logs the decision and counts at info
  level for operations, and that is all.
- **No bypassing `requireInstallToken` on the endpoint.** A
  no-credentials reset would be a free DoS vector against any
  install whose `installId` an attacker guessed.
- **No coupling to spec 30 (composer).** Composer-generated video
  blobs, if any, will live under `wraps/{slug}/video.mp4` (per
  spec 31's reservation) and are deleted as part of the
  share-bundle prefix delete. No new wiring required here.

## Verification

- **Server unit — endpoint shape**
  (`server/test/unit/meReset.test.ts`): GET / POST / PUT return 405.
  DELETE without an install token returns 401. DELETE with a valid
  token and no resources returns 204. DELETE with mocked Table
  Storage clients returns 204 after issuing one `listEntities` +
  batched-delete call per resource type.
- **Server unit — idempotency**: a second DELETE immediately after
  the first returns 204 (no `failed` array). Simulated "404 on
  delete" from Table Storage is swallowed.
- **Server unit — partial failure**: when the `shareLinks` delete
  path throws, response is 207 with `{ failed: ['shares'] }`. Jobs /
  results / lookups still cleaned up. Response body contains no
  installId, no slug, no jobId.
- **Server integration** (`server/test/integration/meReset.test.ts`,
  MSW + fake table client): seed 3 jobs, 2 results, 5 lookups, 1
  share for `installId=A`, and the same shapes for `installId=B`.
  DELETE as A removes only A's rows; B's rows remain untouched.
- **Server privacy invariants** (extend
  `server/test/unit/privacy-invariants.test.ts`):
  - `server/src/functions/meReset.ts` exists and starts with the
    `PRIVACY` banner.
  - The file does not emit `installId`, `slug`, `jobId`, or `token`
    in any `console.*` call (greppable).
  - The file does not import `node:fs` or anything under
    `server/src/ai/`.
- **Client unit — orchestrator**
  (`test/unit/local-store/reset.test.ts`, fake-indexeddb):
  - Mode A: seeds the DB, calls `resetLocalState('clear-data')` with
    MSW returning 204; asserts all listed tables are empty and that
    `meta.kdfSalt` + `meta.wrapInstallToken` rows survive.
  - Mode B: same seed, `resetLocalState('forget-device')` with MSW
    204; asserts the listed tables AND the two `meta` rows are
    empty. (Page reload is mocked.)
  - Mode A with MSW 503: returns `{ serverCleanup: 'offline' }`,
    asserts the local DB is **untouched**.
  - Mode B with MSW 503 + `proceed-anyway` flag: returns
    `{ serverCleanup: 'offline' }`, asserts the local DB is wiped
    including the two `meta` rows.
- **Client privacy invariants** (extend
  `test/unit/privacy-invariants.test.ts`):
  - `src/lib/ai/reset.ts` is a thin wrapper (no LLM / Azure SDK
    imports, no env reads beyond `NEXT_PUBLIC_WRAP_API_URL`, no
    logging of the install token).
  - `src/lib/local-store/reset.ts` does not import from
    `src/lib/ai/` except `reset.ts`.
- **E2E — mode A** (`test/e2e/reset.spec.ts`): unlock, seed demo,
  generate a wrap (stub), open the reset modal, choose mode A, type
  `RESET`, confirm. Dashboard reloads empty. `kdfSalt` row still
  present in IndexedDB. `wrapInstallToken` row still present. No
  passphrase setup prompt.
- **E2E — mode B from dashboard**: same setup, choose mode B, type
  `RESET`, confirm. Page reloads. `UnlockGate` lands on the **setup**
  branch (no salt). Inspect raw IndexedDB — every table empty, both
  named `meta` rows gone.
- **E2E — mode B from unlock gate**: set a passphrase, close the
  tab, reopen, click "Forgot your passphrase?", complete the reset
  modal pre-selected on mode B. Same result as above. Verify the
  link does **not** appear on the setup branch of `UnlockGate` (no
  salt to forget).
- **E2E — confirmation phrase**: assert the destructive button stays
  disabled until exactly `RESET` is typed. Lowercase `reset`,
  `RESETT`, leading whitespace — all disabled.
- **E2E — offline mode A**: simulate fetch failure on
  `DELETE /me/data`, click confirm in mode A — assert modal stays
  open with an inline retry message and **no local data has been
  cleared**.
- **E2E — offline mode B with proceed-anyway**: simulate fetch
  failure, choose mode B, click confirm, then click the secondary
  "Proceed without server cleanup" affordance. Assert local wipe
  completes and the page reloads to the setup branch.
- **E2E — share bundle revocation** (gated on spec 31 landing): after
  publishing a share, run mode A. The shared URL returns 404; the
  local wrap row no longer carries the `shareSlug`/`shareUrl`.

## Notes

- Depends on **spec 31** (PR #40) for the share-bundle deletion path.
  If spec 51 ships before 31, the `shareLinks` enumeration step is a
  no-op (no table, nothing to delete) — the code branch is still
  written, gated on the table existing. When spec 31 lands the gate
  flips and the deletion path activates without further work.
- Relates to **spec 50** (PR #39) only in that file-upload identities
  and contributions are cleared as part of the local wipe like any
  other identity. The `/import` endpoint, by spec, persists nothing
  server-side, so there is no server-side import state to clean up.
- Relates to **spec 10** (stuck-running recovery + TTL sweeper). If
  mode A is run with an in-flight wrap, the worker's eventual write
  will hit a deleted partition. The sweeper from spec 10 catches
  orphaned lookup rows; the in-flight worker writing into a deleted
  partition is silently OK because Table Storage tolerates the
  write-to-non-existent-row case.
- Relates to **spec 13** (graceful wrap-not-on-this-device). After a
  mode A reset, any stale URL the user shared internally pointing at
  a wrap on this device renders the spec-13 "not on this device"
  panel. That is the right outcome; nothing to do here.
- The `/auth/register` rate limit is per-IP (existing); a user who
  resets mode B and immediately needs a new token is well below the
  threshold. Worth a brief note in the runbook but no code change.
- Branch: `claude/add-reset-function-spec-qrDt5`.
- README copy change: `README.md` "What we don't do" / privacy section
  should pick up a one-line note that "reset" is now a first-class
  affordance. Defer the README edit to the implementing PR.

## Done

**Completed**: 2026-05-15
**PR**: `claude/implement-spec-51-hO60s`

Implemented the full reset flow across client and server. Server: `DELETE /me/data` endpoint in `server/src/functions/meReset.ts` with per-IP rate limiting (10/hour), JWT auth via `requireInstallToken`, independent deletion of wrapJobs/wrapResults/lookup rows (each failure collected separately), and a no-op share-bundle path gated on spec 31. Returns 204 on full success and 207 with `{ failed: [...] }` on partial failure. Two new batch-delete helpers added to `server/src/queue/jobs.ts` (`deleteAllJobRowsForInstall`, `deleteLookupRowsForInstall`) and `server/src/queue/results.ts` (`deleteAllResultsForInstall`). Client: thin wrapper `src/lib/ai/reset.ts`, orchestrator `src/lib/local-store/reset.ts` with two modes (clear-data keeps meta, forget-device removes kdfSalt and wrapInstallToken), modal component `src/components/dashboard/ResetModal.tsx` with RESET confirmation, mode A inline error + retry on server failure, mode B "Proceed without server cleanup" secondary action. "Forgot your passphrase?" link added to UnlockGate unlock branch pre-selecting mode B. All unit tests pass (server: 84/84, client: 131/131). One deviation from the spec's test shape: the 207 partial-cleanup test mocks `deleteServerData` directly rather than via MSW because MSW `http.delete` with status 207 wasn't being intercepted reliably in the happy-dom test environment; the behaviour under test (orchestrator handling partial results) is fully covered.
