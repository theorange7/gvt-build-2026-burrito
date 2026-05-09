# Spec 12 — Encrypt `pendingWrapRequests`

**Status**: Shaped — ready to pick up
**Branch**: client
**Appetite**: small (≤ 1 day; realistically ~half day)
**Last shaped**: 2026-05-09

## Problem

The `pendingWrapRequests` table in IndexedDB is currently plaintext. Every
other user-data table (`contributions`, `wraps`) is envelope-encrypted with
the unlock-derived key. A user reading raw IDB sees opaque blobs everywhere
**except** the pending row, which spells out `mode`, `windowStart`,
`windowEnd`, `requestedAt` — telling them "this user generated a year-end
wrap for 2025 on May 9th." The wrap content stays private, but the metadata
isn't.

This is mostly a **privacy story consistency** fix. The app's framing is
"everything sensitive is encrypted at rest"; today that's a lie for one
table. The threat model where it actually matters:

- Casual dev-tools snooper / shoulder-surfer at a shared device → sees opaque
  bytes after this fix instead of structured timestamps.
- Lost-laptop / device-handover before passphrase entry → uniformly opaque
  IDB instead of "this person ran a Q2 2025 wrap last Tuesday."

The threat model where it doesn't move the needle:

- Malware with IDB access. Same malware can usually scrape the in-memory key.
- Forensic decryption with the passphrase known.

We're encrypting because of the consistency story, not because of a specific
attack. That's still worth doing.

## Solution shape

Reuse the existing AES-GCM-256 envelope (`src/lib/local-store/crypto.ts`)
for `pendingWrapRequests` rows. Same shape as `wraps` already uses:

- Keep `id` (= jobId UUID) as the **plaintext** primary key. UUIDs are
  random by definition, so leaving the key plaintext leaks no signal.
- Encrypt the rest of the row as an envelope `{iv, ct}` over the JSON
  payload `{mode, windowStart, windowEnd, requestedAt, status, busy,
  lastCheckedAt}`.
- Decrypt-on-read inside `pendingWraps.ts` helpers (`add`, `list`,
  `update`, `remove`). Typical row count is 0–1; decrypt-all on `list()`
  is fine.

### Schema migration

Bump Dexie schema from v3 → v4. The migration **drops** existing v3 rows.
Justification: pending rows are inherently transient — they survive only as
long as the wrap is in flight. Dropping a wrap that was mid-generation at
the moment of the upgrade is acceptable; the user re-runs Generate.

Don't try to translate v3 plaintext rows into v4 envelopes during migration.
The unlock key isn't available at the moment Dexie runs migrations (it's
keyed off the passphrase the user hasn't typed yet at app boot). That alone
makes in-migration encryption impossible.

## Rabbit holes

- **Don't try to keep `status` plaintext for indexed queries**. There aren't
  any — `pendingWraps.list()` returns all rows; `pendingWraps.get(id)` looks
  up by primary key. You don't need an index on `status`.
- **Don't migrate v3 rows**. Dropping them is the correct call (see schema
  migration above). A migration that *tries* and fails halfway leaves the
  user's IDB in a worse state than a clean drop.
- **Don't add a separate "metadata" column for indexable fields**. We don't
  need to query on any of them; full-row encryption is simpler.
- **Don't change `wraps.ts`**. That table's already fine; this is a pure
  parity fix on `pendingWraps.ts`.

## No-gos

- Expanding the threat model to include in-memory key extraction. AES-GCM
  envelope encryption is for at-rest, full stop. If the attacker has live
  memory access we have bigger problems.
- Adding any new IV-reuse protection beyond what `crypto.ts` already
  provides. The existing helpers handle that.
- Changing the unlock UX in any way. This is invisible to the user.
- Server-side anything. The pending table is purely a client concept.

## Verification

- **Unit test**: round-trip `add` → `list` → `get` returns the same fields
  the caller provided. Lock the store between write and read; assert read
  fails with the same error shape `crypto.ts` raises on locked-store
  access.
- **Schema-migration test**: open a Dexie instance pre-seeded with a v3
  row, upgrade to v4, assert the v3 row is gone (intentionally dropped)
  and the new v4 store accepts envelope writes.
- **At-rest test**: directly inspect the raw IndexedDB row after a write
  and assert no plaintext `mode` / `windowStart` / `windowEnd` fields are
  visible — only `id`, `iv`, `ct`.
- **Run the existing privacy invariants** (`test/unit/privacy-invariants.test.ts`)
  — they should still pass. If they currently allow plaintext on this
  table, tighten the assertion as part of this work.

## Notes

- `src/lib/local-store/db.ts` — Dexie schema definition.
- `src/lib/local-store/pendingWraps.ts` — the helpers to update.
- `src/lib/local-store/crypto.ts` — `encryptJSON` / `decryptJSON` — same
  shape used by `wraps.ts:30-46`.
- This spec's "no-go on in-memory key extraction" is a deliberate scope
  boundary — if a future spec wants to address that, it would be about
  shortening the idle-lock timeout or moving the key into a Web Worker,
  not about the storage layer.
