# Spec 50 — File-upload contribution provider

**Status**: Shaped — ready to pick up
**Branch**: both (client + server)
**Appetite**: medium (≤ 3 days)
**Last shaped**: 2026-05-14

## Problem

Today the only way to get contributions into the app is (a) the GitLab
Dedicated provider, (b) the bundled demo seed, or (c) typing them in
one-by-one through `ManualInputForm`. That leaves real users stranded
the moment their source-of-truth isn't GitLab Dedicated: anyone with
GitHub-Enterprise-on-prem behind SSO, a Jira export, a script that
already exists in their dotfiles dumping commits to JSON, or a
spreadsheet a manager keeps of "wins this year."

The manual form is fine for the contribution a system missed; it is not
fine for hundreds of rows. And building dedicated remote-API providers
for every source — GitHub, Bitbucket, Jira, Linear, Slack, Confluence —
is multi-week work per provider that we don't have before the upcoming
demo.

What we want: let the user point at a file in **any reasonable text
format** (CSV, JSON, plain-text log, Markdown notes, a `git log`
dump, …) and have the contents land as contributions, normalized through
the same pipeline that GitLab and demo data flow through. This is the
"escape hatch" that makes the app demoable for users whose source isn't
yet a first-class provider.

Because there is no way to write a parser for every format users might
bring, V1 punts the extraction problem to an LLM on the server. That's
a real shift from the local-first posture, and the spec is explicit
about what changes (file content briefly leaves the device, processed
in memory, never persisted) and what doesn't (the extracted
contributions still land encrypted on-device; the user's local store
remains the source of truth).

## Solution shape

Three pieces, in order of where the work lives:

1. **Server** — new function `POST /import` that takes a file + model
   choice, hands the contents to the LLM with an extraction prompt,
   validates the output, returns a normalized array. Nothing persists
   server-side. Nothing queues. Synchronous request/response.
2. **Client provider** — new `file-upload` provider under
   `src/lib/providers/file-upload/`, using a new `ImportAdapter`
   capability on `ContributionProvider`. Its `run()` is a thin HTTP
   wrapper around `POST /import`. The orchestrator persists the
   returned rows through the same encrypted-bulk-add path as every
   other provider.
3. **UI** — a new "Import from file" entry in the dashboard's provider
   panel. Two-step modal with an **explicit, prominent** egress
   disclosure before the upload kicks off.

### Server: `POST /import`

New function `server/src/functions/import.ts`. PRIVACY banner required
(see CLAUDE.md hard rule 6). Auth: `requireInstallToken` middleware,
same as every other function.

Request: `multipart/form-data` with two fields:
- `file` — the user's file. Hard cap: **256 KB** (well under any
  model's context window after the prompt overhead). Larger files get
  413 with a clear message.
- `meta` — JSON blob: `{ modelId: string, label: string }`. `modelId`
  is one of the configured ids in `server/src/ai/models.config.json`.

Response on success: `200` with body
```ts
{
  contributions: NormalizedContribution[];
  rejectedRows: number;
}
```
Response on failure: `400` (validation), `413` (too big), `415`
(unreadable as text), `502` (LLM upstream failed). All errors flow
through the existing `safeError` helper — no payload, no file content,
no token in the error body or logs.

Implementation outline:
1. Read multipart, hold file bytes in memory only. Verify size ≤ 256 KB.
2. Decode as UTF-8. Files that don't decode → `415`.
3. Call the chosen model with the extraction prompt (see below). Use
   the existing `callModel` in `server/src/ai/client.ts` — no new
   provider plumbing.
4. Parse model output as JSON. Validate against
   `NormalizedContributionsSchema` (Zod). Drop rows that fail
   per-row validation; count them as `rejectedRows`.
5. Return the response. Function scope ends; GC reclaims everything.

A new prompt module `server/src/ai/prompts/importExtract.ts` builds the
user message:
- System: instructs the model to return a JSON array matching the
  schema, with allowed `source`/`category` values, and to use stable
  `externalId`s (e.g. a hash of `signal + occurredAt`) when no natural
  id is present in the input.
- User: the file contents verbatim, prefixed with the user's `label`
  string for context (e.g. "This file is the user's Q1 commits.").

### Concrete privacy / purge guarantees

These are the mechanisms — they are also the things the test suite
asserts. The PRIVACY banner on `import.ts` enumerates them.

- **No persistence**. `import.ts` does **not** import from
  `server/src/queue/*` (Service Bus, Table Storage), and does **not**
  import `@azure/storage-blob`. Enforced by a new privacy-invariant
  test (`server/test/unit/privacy-invariants.test.ts`).
- **No disk writes**. `import.ts` does **not** import `node:fs`. Same
  test.
- **No content logging**. The function logs only counts and the
  `modelId`. The privacy test greps for `console.*` calls in the file
  and fails if more than the allowlisted ones are present (mirrors how
  we already gate the wrap pipeline).
- **No retention on error**. The `catch` paths use `safeError`, which
  strips PII before returning. Logs include the request id and the
  error code, never the body.
- **No replay/cache layer**. The function does not write to any
  read-through cache, blob, or table. Each request is independent.
- **Egress scope is the model provider**. The file contents do reach
  the model (Anthropic or Azure Foundry, per `modelId`). That is the
  *only* additional party. We do not send the file anywhere else, and
  we do not retain anything once `callModel` returns.

The UI disclosure (below) names the model provider chosen, so the user
sees who their data touches before they click upload.

### Type contract (additions to `src/lib/providers/types.ts`)

```ts
export type AuthAdapter =
  | OAuthPkceAdapter
  | ApiTokenAdapter
  | NoCredentialsAdapter;

export interface NoCredentialsAdapter {
  kind: 'none';
}

export interface ImportAdapter {
  // One-shot import. Returns already-normalized rows (extraction +
  // normalization both happen server-side via the LLM, so there is
  // no client-side RawEvent stage to model).
  run(args: {
    file: File;
    modelId: string;
    identity: ExternalIdentity;
    signal: AbortSignal;
  }): Promise<{
    contributions: NormalizedContribution[];
    rejectedRows: number;
  }>;
  externalIdFor(c: NormalizedContribution): string;
}

export interface ContributionProvider {
  readonly id: string;
  readonly displayName: string;
  readonly capabilities: ProviderCapabilities;
  readonly auth: AuthAdapter;
  readonly identity: IdentityAdapter;
  readonly sync?: SyncAdapter;     // now optional
  readonly import?: ImportAdapter; // new
}
```

Exactly one of `sync` / `import` must be present on a provider; the
registry enforces this at registration. `ProviderCapabilities` gains
`supportsFileImport: boolean` so UI can branch without reaching into
the adapter shape.

### Client provider implementation (`src/lib/providers/file-upload/`)

```
file-upload/
  auth.ts          NoCredentialsAdapter — { kind: 'none' }
  identity.ts      resolve() — synthesizes identity from the label
  import.ts        POSTs file to /import, parses + Zod-validates response
  index.ts         Registers the provider
```

`import.ts` lives in `src/lib/providers/file-upload/`, **not** in
`src/lib/ai/`. The `src/lib/ai/` thinness invariant (CLAUDE.md hard
rule 2) is unchanged: we add a sibling thin HTTP wrapper for `/import`
under `src/lib/ai/import.ts` (alongside `classify.ts`, `generate.ts`),
and the file-upload provider's `import.ts` calls it. That keeps the
"all server hops live in `src/lib/ai/`" rule intact.

### Identity

A file upload has no remote user. We synthesize a stable identity per
upload **label** keyed by `(providerId='file-upload',
instanceUrl='local', externalUserId=<label, slugified>)`. The connect
UI asks for a one-line label ("Q1 commits from work laptop") before
the file picker enables; that label becomes both `externalUserId` and
`displayName`. Re-uploading under the same label appends to the same
identity and dedupes by `externalId` like every other provider.

This keeps `disconnectIdentity` semantics meaningful — the user can
clear "everything they imported under this label" without touching
GitLab or other identities.

### Orchestrator (additions to `src/lib/providers/orchestrator.ts`)

```ts
export async function connectFileUploadIdentity(args: {
  label: string;
}): Promise<ConnectResult>; // upserts identity, stores no tokens

export async function importIntoIdentity(
  identityId: string,
  file: File,
  options: { modelId: string; signal?: AbortSignal },
): Promise<{ added: number; skippedExisting: number; rejectedRows: number }>;
```

`importIntoIdentity` calls the provider's `run()`, then walks the same
`findExistingExternalIds` → `bulkAddContributions` path that
`syncIdentity` uses. All encryption-on-write and externalId-collision
guarantees come along for free. It does **not** touch `importedRanges`
or `syncState` (those are for cursored backfills).

### UI shape

One new entry in the dashboard's provider panel
(`src/components/dashboard/DashboardShell.tsx`). Three-step modal:

```
┌────────────────────────────────────────────────────┐
│  Import from a file                                │
│                                                    │
│  Step 1 of 2 — label this batch                    │
│  ┌────────────────────────────────────────────┐    │
│  │ e.g. "Work laptop, Q1 commits"             │    │
│  └────────────────────────────────────────────┘    │
│                                                    │
│                              [next →]              │
└────────────────────────────────────────────────────┘
```

```
┌────────────────────────────────────────────────────┐
│  Step 2 of 2 — file and model                      │
│                                                    │
│  Model: [ Sonnet 4.6 (Anthropic) ▾ ]               │
│  File:  [ Choose file ]   No file chosen           │
│                                                    │
│  ┌───────────────────────────────────────────────┐ │
│  │ Heads up — this is different from the rest    │ │
│  │ of Wrapped for Work.                          │ │
│  │                                               │ │
│  │ Your file will be sent to Anthropic to        │ │
│  │ extract contributions. It is processed in     │ │
│  │ memory and discarded immediately. The         │ │
│  │ extracted contributions are encrypted and     │ │
│  │ stored only on this device.                   │ │
│  │                                               │ │
│  │ Max file size: 256 KB. Text-based files only. │ │
│  └───────────────────────────────────────────────┘ │
│                                                    │
│             [cancel]  [upload and extract]         │
└────────────────────────────────────────────────────┘
```

The disclosure panel is **not collapsible**, **not behind a tooltip**,
and the model provider name in it updates when the model is changed.
Result panel after success:

```
┌────────────────────────────────────────────────────┐
│  Imported 134 contributions.                       │
│  3 were duplicates (already in your dashboard).    │
│  2 rows didn't parse cleanly and were skipped.     │
│                                                    │
│  Your file has been discarded.                     │
│                                                    │
│                                       [done]       │
└────────────────────────────────────────────────────┘
```

## Rabbit holes

- **Reusing the wrap enqueue → poll pipeline**. Tempting because it
  exists. Wrong because it persists the job in Table Storage and the
  payload (briefly) on Service Bus — which directly violates the purge
  guarantee. The `/import` endpoint must be synchronous and bypass the
  queue entirely.
- **Streaming the file to the LLM**. The chat-completions APIs we use
  don't really support multi-part streamed user messages, and we'd
  lose the input-size cap. Keep the 256 KB hard cap and a single
  synchronous call. Revisit only with measured demand.
- **Server-side classification fallback**. If the LLM returns rows
  missing `category`, don't loop them through `/classify` to fill it
  in — that's a second LLM hop with weaker context. Default missing
  `category` to `'other'` and let the user re-categorize.
- **Caching extractions by file hash**. Looks like a free perf win.
  It is not — a cache layer is persistence, which the purge guarantee
  forbids. If a user uploads the same file twice the dedupe-by-
  `externalId` already prevents duplicate contributions; the LLM call
  re-runs and that's fine.
- **Re-classifying every row through `/classify`**. The LLM already
  produced a category in the extraction step. A second hop costs
  tokens and is redundant.
- **Letting the user pick the source string**. The LLM is responsible
  for guessing the `source` field per row from the file content. Don't
  add a "source override" UI in V1 — the manual edit affordance on
  individual contributions (existing feature) is the right escape
  hatch.
- **Encrypting the uploaded file at rest in the browser**. The file
  isn't stored client-side. It's read by `FormData`, posted, and the
  `File` reference goes out of scope when the modal closes.
- **PDF / DOCX / binary parsing**. Out of scope. The 415 path handles
  it: decode-as-UTF-8 failure → "text-based files only." Power users
  can `pdftotext` themselves first.

## No-gos

- **Persisting any part of the uploaded file or its extracted
  contents on the server**. No Service Bus, no Table Storage, no Blob
  Storage, no disk, no in-process cache that outlives the request, no
  structured logging of row content. The privacy-invariant test
  enforces the import path doesn't import any of those modules.
- **Logging file contents, the model's raw output, or the model's
  parsed contributions**. Only counts, modelId, and `safeError`-
  stripped error codes.
- **Background sync for file-upload identities**. There is nothing to
  sync — the file was a one-shot. The dashboard's "Sync" affordance
  must not appear for `file-upload` identities.
- **A "remember last file" or auto-re-import-on-launch feature**.
  Implicit re-egress of user data is exactly wrong for this app.
- **Hiding or de-emphasising the egress disclosure**. The disclosure
  panel is mandatory, non-collapsible, and names the model provider.
- **Editing the existing `ContributionProvider.sync` field's type to
  accommodate imports**. Sync stays as-is; add a sibling `import`
  field.
- **Adding `/import` to the existing wrap worker**. Different
  function file. Different privacy banner. Different invariants.

## Verification

- **Type contract**: `pnpm typecheck` passes (client + server). The
  registry's "exactly one of sync/import" invariant has a unit test
  (`test/unit/providers/registry.test.ts`).
- **Server privacy invariants** (new tests in
  `server/test/unit/privacy-invariants.test.ts`):
  - `server/src/functions/import.ts` does not import from
    `server/src/queue/*`, `@azure/storage-blob`, `@azure/data-tables`,
    or `node:fs`.
  - `server/src/functions/import.ts` has a PRIVACY banner.
  - Only allowlisted `console.*` calls are present; the function does
    not log the file body, the model's raw response, or per-row
    contents.
- **Server function tests** (`server/test/integration/import.test.ts`,
  MSW-mocked LLM):
  - Happy path: a small text body → 200 with N normalized
    contributions; nothing was written to any storage primitive
    (asserted via `vi.spyOn` on the imported queue modules — they
    must not even be imported).
  - 413 on oversized body.
  - 415 on non-UTF-8 body.
  - 502 on LLM error; error body contains no file content.
  - Rows that fail Zod validation are reported as `rejectedRows` and
    do not appear in `contributions`.
- **Client provider tests**:
  - `src/lib/providers/file-upload/import.ts` is a thin wrapper:
    posts to `/import`, validates the response with Zod, surfaces
    network errors as `ProviderTransientError`.
  - Provider invariants in `test/unit/privacy-invariants.test.ts`
    continue to pass — the new module does not import from
    `src/lib/local-store/*` (only the orchestrator does that).
- **Round-trip integration test**
  (`test/integration/providers/file-upload.test.ts`): connect a
  file-upload identity with label "test-batch", import a small text
  blob (LLM mocked to return 5 rows), assert 5 rows persisted, 0
  network calls to `/classify` or `/wrap`, exactly 1 call to `/import`.
- **Dedupe**: importing twice with the same mocked LLM response yields
  `{ added: 5, skippedExisting: 5, rejectedRows: 0 }` on the second
  run.
- **UI smoke** (`test/e2e/file-upload.spec.ts`): open the dashboard,
  open the import modal, label the batch, choose a fixture text file,
  see the disclosure panel naming the model provider, click upload
  (LLM mocked), see the result panel including the "Your file has been
  discarded." line, see new contributions in the feed.
- **Disconnect**: `disconnectIdentity(identityId, { deleteContributions: true })`
  on a file-upload identity removes its contributions and the
  identity row; does not touch any other identity.

## Notes

- This is the first feature where any contribution content leaves the
  device. The README's "local-first" framing needs a small caveat
  added in the implementing PR, naming this provider as the explicit
  carve-out and what bounds it (synchronous, in-memory, no
  persistence, named-provider egress).
- `ContributionSource` is intentionally an open string
  (`shared/src/types.ts:22`); this spec relies on that — the LLM is
  free to set `source` to anything reasonable.
- Coordinates with spec 30 (composer) only loosely — both produce
  contributions ultimately, but composer is render-side. Land
  independently.
- Cross-reference: the contribution-provider pattern decision doc
  lives at `docs/decisions/contribution-provider-pattern.md` (per the
  header comment in `src/lib/providers/types.ts`); the `import`
  capability added here is a backwards-compatible extension and
  should be noted there in the implementing PR.
- **Reshaping history**: originally shaped 2026-05-14 as a fully
  client-side JSON-only importer. Reshaped same day to server-side
  LLM extraction after demo-deadline pressure made building remote
  providers per source untenable. The privacy-disclosure pieces of
  the spec exist because of that shift.
- Future spec, not this one: a "templates" docs page showing how to
  feed common exports (`git log`, GitHub Issues CSV, Jira JQL export)
  to the importer — although the LLM already absorbs those formats,
  curated examples reduce the surprise factor.
- Future spec, not this one: a fully client-side JSON-only path for
  users who want to keep the strict no-egress posture. Deferred
  because the demo pressure points at the magical path, and we want
  one well-tested mechanism rather than two half-tested ones.
