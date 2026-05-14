# Spec 50 — File-upload contribution provider

**Status**: Shaped — ready to pick up
**Branch**: client
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
fine for hundreds of rows. And we explicitly don't want to bolt on a
provider per Bring-Your-Own-Format integration — the cost is wrong for
a privacy-first local app.

What we want: let the user point at a file and have the contents land
as contributions, end-to-end on-device, normalized through the same
pipeline that GitLab and demo data flow through. No new server hop, no
file ever leaving the browser.

## Solution shape

Add a third contribution-provider, `file-upload`, that participates in
the same registry as `gitlab-dedicated` but exposes a one-shot **import**
capability instead of a cursored `sync`. The provider contract gains an
optional `ImportAdapter`; the orchestrator gains an `importIntoIdentity`
entry point that mirrors `syncIdentity` for the file case. Existing
remote providers are unchanged.

### Type contract (additions to `src/lib/providers/types.ts`)

```ts
export type AuthAdapter = OAuthPkceAdapter | ApiTokenAdapter | NoCredentialsAdapter;

export interface NoCredentialsAdapter {
  kind: 'none';
  // No methods — present only so the discriminant covers every provider.
}

export interface ImportAdapter {
  // One-shot read. No cursor, no signal-driven pagination. The provider
  // returns an async iterable so very large files don't have to be held
  // in memory all at once.
  run(args: {
    file: File;
    identity: ExternalIdentity;
    signal: AbortSignal;
  }): AsyncIterable<RawEvent>;
  normalize(args: {
    event: RawEvent;
    identity: ExternalIdentity;
  }): NormalizedContribution[];
  externalIdFor(event: RawEvent): string;
}

export interface ContributionProvider {
  readonly id: string;
  readonly displayName: string;
  readonly capabilities: ProviderCapabilities;
  readonly auth: AuthAdapter;
  readonly identity: IdentityAdapter;
  readonly sync?: SyncAdapter;     // now optional
  readonly import?: ImportAdapter; // new, optional
}
```

Exactly one of `sync` / `import` must be present on a provider. The
registry enforces this at registration time (a single `if` in
`registerProvider`). `ProviderCapabilities` gains
`supportsFileImport: boolean` so UI can branch without reaching into the
adapter shape.

### File format (V1)

JSON only. The accepted shape is the **same** as
`public/demo-contributions.json` — one array, each entry a partial
`Contribution` minus `id`/`userId`/`identityId`/`createdAt`. We already
have an unofficial spec for that shape; promoting it to "the import
format" costs nothing and gives users a working example to copy.

A Zod schema (`FileImportSchema` in
`src/lib/providers/file-upload/schema.ts`) parses the file at the
boundary. Required fields: `signal`, `occurredAt` (ISO string), `source`
(string). Optional: `category`, `weight`, `externalId`, `externalUrl`,
`rawData`. Defaults: `category = 'other'`, `weight = 2`,
`externalId = sha256(signal + occurredAt + source)`.

CSV is **out of scope** — see "No-gos."

### Identity

A file upload has no remote user. We synthesize a stable identity per
upload session keyed by `(providerId='file-upload', instanceUrl='local',
externalUserId=<user-chosen label, slugified>)`. The connect UI asks for
a one-line "label" (e.g. "Q1 commits from work laptop") before the file
picker opens; that label becomes both `externalUserId` and `displayName`
in `ExternalIdentity`. Re-uploading under the same label appends to the
same identity (and dedupes by `externalId`, same as every other
provider).

This keeps `disconnectIdentity` semantics meaningful — the user can
clear "everything they imported under this label" without touching their
GitLab data.

### Orchestrator (additions to `src/lib/providers/orchestrator.ts`)

```ts
export async function connectFileUploadIdentity(args: {
  label: string;
}): Promise<ConnectResult>; // upserts the identity, stores no tokens

export async function importIntoIdentity(
  identityId: string,
  file: File,
  options?: { signal?: AbortSignal },
): Promise<{ added: number; skippedExisting: number; rejectedRows: number }>;
```

`importIntoIdentity` walks the same `persistEvents` path as
`syncIdentity` — bulk add with `findExistingExternalIds` dedupe — so all
the encryption-on-write, externalId-collision, and category-validation
guarantees come along for free. It does **not** touch
`importedRanges` (those are for cursored backfills) or `syncState`.
`rejectedRows` is the count of rows that failed Zod validation; the
provider's `run()` skips them and emits a console warning (count only,
no row content — never log payloads, see CLAUDE.md hard rules).

### Provider implementation (`src/lib/providers/file-upload/`)

```
file-upload/
  auth.ts          NoCredentialsAdapter — a single { kind: 'none' } object
  identity.ts      resolve() returns the synthesized identity
  import.ts        File reader + Zod streaming validation, yields RawEvents
  normalize.ts     One RawEvent → one NormalizedContribution
  schema.ts        Zod schema for the JSON file format
  index.ts         Registers the provider
```

The reader uses `file.text()` and `JSON.parse` for V1. Streaming JSON
parsing is a rabbit hole (see below). If users hit a too-large-file wall
we'll measure first and decide.

### UI shape

One new entry in the dashboard's provider panel
(`src/components/dashboard/DashboardShell.tsx` — the same panel that
exposes "Connect GitLab"). Two-step flow inside a modal:

```
┌────────────────────────────────────────────────────┐
│  Import from a file                                │
│                                                    │
│  Label this batch (helps if you import more than   │
│  once)                                             │
│  ┌────────────────────────────────────────────┐    │
│  │ e.g. "Work laptop, Q1 commits"             │    │
│  └────────────────────────────────────────────┘    │
│                                                    │
│  ┌──────────────────┐                              │
│  │ Choose JSON file │                              │
│  └──────────────────┘                              │
│                                                    │
│  [download example] [cancel]                       │
└────────────────────────────────────────────────────┘
```

After upload, a result panel:

```
┌────────────────────────────────────────────────────┐
│  Imported 134 contributions.                       │
│  3 were duplicates (already in your dashboard).    │
│  2 rows had invalid dates and were skipped.        │
│                                                    │
│  [done]                                            │
└────────────────────────────────────────────────────┘
```

"Download example" links to `/demo-contributions.json` (which already
exists and matches the schema exactly — that's deliberate).

## Rabbit holes

- **Streaming JSON parser**. Don't pull in `stream-json` or write a
  hand-rolled tokenizer for V1. `file.text()` + `JSON.parse` covers
  the realistic case (a year of one person's contributions is ≪ 100 MB).
  Add a hard size cap (e.g. 25 MB) and a clear error message; revisit
  if real users actually hit it.
- **CSV "while we're here"**. Tempting because spreadsheets are
  everywhere. The cost is schema mapping UI, type coercion for dates,
  and quoting/escape edge cases — none of which are free. Ship JSON,
  measure demand, then decide. Documented under "No-gos."
- **Generic "any source name"**. The `source` field is an open string
  by design (see `shared/src/types.ts` — `ContributionSource = string`).
  Don't try to constrain imports to `KNOWN_CONTRIBUTION_SOURCES`. Do
  emit a console warning if the source isn't known, so a typo like
  `"githhub"` is visible during dev.
- **Reusing the orchestrator's `syncIdentity` path**. Looks DRY,
  actually wrong. Sync is cursored and assumes a live remote; jamming a
  one-shot file read into it would force a fake cursor and a stub
  `provider.sync.run`. Add the parallel `import` path instead.
- **Re-classifying every row through `/classify`**. Don't. The file is
  the source of truth on category. If a row omits `category`, default
  to `'other'` (cheap, deterministic, no network). Users who want AI
  classification can use the manual form.
- **Encrypting the uploaded file at rest**. The file isn't stored. Each
  row becomes a (already-encrypted) contribution row via
  `bulkAddContributions`. The raw `File` is GC'd when the import
  completes.
- **Wiring file upload into `pnpm export:demo`**. Out of scope. The
  demo export is a build-time script; the import provider is a runtime
  feature. They share a *format*, not a code path.

## No-gos

- CSV / Excel / TSV support. JSON only for V1.
- Server-side file processing. The file is read in the browser, parsed
  in the browser, normalized in the browser, and the rows land in
  IndexedDB. The `server/` package is untouched by this spec.
- File upload identities participating in scheduled background sync.
  There's nothing to sync — the file was a one-shot. The dashboard's
  "Sync" affordance must not appear for `file-upload` identities.
- A "remember last file" feature that auto-re-imports. Implicitly
  re-uploading user data on app launch is the wrong default for a
  local-first privacy app.
- Per-row LLM classification, summarization, or any network hop during
  import. Import is offline-capable; that's a feature, not an accident.
- Editing the existing `ContributionProvider` `sync` field's type to
  accommodate imports. Sync stays as-is; add a sibling `import` field.

## Verification

- **Type contract**: `pnpm typecheck` passes. The registry's
  "exactly one of sync/import" invariant has a unit test
  (`test/unit/providers/registry.test.ts`).
- **Schema**: a Zod round-trip test parses `public/demo-contributions.json`
  cleanly through `FileImportSchema` — proves the example file matches
  the accepted import format.
- **Provider invariants**: the existing
  `test/unit/privacy-invariants.test.ts` continues to pass — the new
  module does not import from `src/lib/local-store/*` (only the
  orchestrator does that), does not import any LLM/Azure SDK, and does
  not log file contents.
- **Round-trip integration test**
  (`test/integration/providers/file-upload.test.ts`): connect a
  file-upload identity with label "test-batch", import a 5-row JSON
  blob, assert 5 rows present in the contributions table, identity
  visible in `listIdentities()`, no calls to `/classify` or `/wrap`
  endpoints (MSW spies).
- **Dedupe**: importing the same file twice yields
  `{ added: 5, skippedExisting: 5, rejectedRows: 0 }` on the second
  run.
- **Reject path**: a file with one row missing `signal` yields
  `{ added: 4, skippedExisting: 0, rejectedRows: 1 }` and a single
  console warning containing the count (and not the row body — assert
  this with a spy on `console.warn`).
- **UI smoke**: Playwright test in `test/e2e/file-upload.spec.ts`:
  open the dashboard, open the import modal, choose a fixture JSON
  file, see the result panel, see new contributions in the feed.
- **Disconnect**: calling `disconnectIdentity(identityId, {
  deleteContributions: true })` on a file-upload identity removes its
  contributions and the identity row; does not touch any other
  identity.

## Notes

- The format choice (JSON, not CSV) leans on
  `public/demo-contributions.json` being a de-facto example. If we
  later add CSV, the JSON format remains the canonical / lossless one.
- `ContributionSource` is intentionally an open string
  (`shared/src/types.ts:22`); this spec relies on that. If we ever
  tighten it to the closed `KnownContributionSource` union, the
  file-upload spec's "trust the file's `source` field" stance needs
  to be revisited.
- Future spec, not this one: a "templates" library — a small set of
  hand-rolled converters (jq snippets, Python one-liners) showing how
  to massage common exports (`git log`, GitHub Issues CSV, Jira JQL
  export) into the import shape. Belongs in docs, not in this
  provider.
- Coordinates with spec 30 (composer) only loosely — both produce
  contributions ultimately, but composer is a render-side feature.
  Land independently.
- Cross-reference: the contribution-provider pattern decision doc lives
  at `docs/decisions/contribution-provider-pattern.md` (per the header
  comment in `src/lib/providers/types.ts`); the `import` capability
  added here is a backwards-compatible extension and should be noted
  there in the implementing PR.
