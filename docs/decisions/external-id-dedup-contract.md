# externalId / externalIdFor — Client-Side Dedup Contract

Status: current
Last updated: 2026-05-22

## What this is not

Despite the name, `externalId` has nothing to do with the backend (Azure
Functions). The backend never receives, stores, or queries contribution data.
All contribution persistence is local-first in IndexedDB via Dexie.

## What it is

`externalId` is an idempotency key that answers one question, entirely in the
browser: *"have I already stored this contribution locally?"*

"External" means external to the app — it is the identifier assigned by the
**original data source**, not by any server this app controls. For a GitHub
provider that would be a commit SHA; for GitLab an MR ID; for Jira an issue
key. The dedup check is scoped per-identity via a compound IndexedDB index
`[identityId+externalKey]` (see `src/lib/local-store/contributions.ts:157`).

## How it flows

### Sync providers (GitHub, GitLab, …)

The `SyncAdapter` interface requires `externalIdFor(event: RawEvent): string`.
Each provider returns the upstream canonical ID. The orchestrator's
`persistEvents` function calls `findExistingExternalIds` before inserting,
dropping any rows whose `externalId` is already present for that `identityId`.
This makes every sync idempotent: running the same sync window twice won't
duplicate contributions.

### File-upload provider

There is no authoritative upstream ID — the data comes from an unstructured
file parsed by an LLM. The `ImportAdapter` interface defines `externalIdFor`
instead:

```ts
// src/lib/providers/file-upload/import.ts
function externalIdFor(c: NormalizedContribution): string {
  if (c.externalId) return c.externalId;
  // Deterministic fallback: re-uploading the same file dedupes even if
  // the model didn't return an externalId.
  const ts = c.occurredAt.toISOString().slice(0, 19);
  const sig = c.signal.replace(/\s+/g, ' ').trim().slice(0, 120);
  return `file-upload:${ts}:${sig}`;
}
```

If the LLM returned an `externalId` (e.g. a commit SHA it found in the file),
that is used directly. Otherwise a deterministic string is synthesized from
`signal + occurredAt`. Either way, re-uploading the same file against the same
label-identity will produce no new rows.

## The identity layer

`externalId` dedup is scoped to an `identityId`. For the file-upload provider,
identity is established by the user-supplied label:

1. The label is slugified (`"Q1 Work Laptop"` → `"q1-work-laptop"`) and used
   as `externalUserId` — see `src/lib/providers/file-upload/identity.ts`.
2. `upsertIdentity` does a lookup on the compound index
   `[providerId, instanceUrl, externalUserId]` in the `identities` table. Same
   slug = same identity row = same `identityId`.
3. All dedup checks scope to that `identityId`, so two uploads under the same
   label share one identity and one dedup namespace. Two uploads under different
   labels are independent identities and don't interfere.

## Storage layout

`externalId` is stored in **two** places per contribution row:

- **Plaintext** as `externalKey` on the `ContributionRow` — needed for the
  IndexedDB compound index `[identityId+externalKey]` that `findExistingExternalIds`
  queries. Plaintext index entries are an accepted trade-off documented in
  `contribution-provider-pattern.md` (§ Storage contract).
- **Encrypted** inside the `SecretPayload` ciphertext blob alongside `signal`
  and `rawData` — so the full value is recoverable after decryption even if the
  index entry were lost.

## Invariants enforced by tests

`test/unit/privacy-invariants.test.ts` and `server/test/unit/privacy-invariants.test.ts`
assert that the server never imports from the local store and never receives
contribution payloads. The dedup logic therefore cannot silently migrate to the
server without breaking CI.
