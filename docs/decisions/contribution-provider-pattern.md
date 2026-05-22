# Contribution Provider Pattern

Status: design proposal for Burrito v1 — extended by spec 50
Last updated: 2026-05-17

## Extension: file-upload import path (spec 50, 2026-05-17)

The original pattern modelled every provider as **pull** (cursor + remote
API + raw events → normalized contributions). Spec 50 adds **push** as a
backwards-compatible second shape: a provider whose only ingest path is a
one-shot file upload. The contract was extended:

- `ContributionProvider.sync` is now optional and is joined by an
  optional `ContributionProvider.import: ImportAdapter`. The registry
  enforces "exactly one of sync or import" at registration time.
- `AuthAdapter` gained a third variant `NoCredentialsAdapter`
  (`{ kind: 'none' }`) for providers with no remote token to validate.
- `ProviderCapabilities` gained `supportsFileImport: boolean` so UI can
  branch without reaching into the adapter shape.
- The orchestrator gained `connectFileUploadIdentity({ label })` and
  `importIntoIdentity(identityId, file, { modelId, label? })`. Both reuse
  the same `findExistingExternalIds` → `bulkAddContributions` path that
  `syncIdentity` uses, so encryption-on-write and externalId-dedupe
  guarantees come along unchanged.

Privacy carve-out (only applies to the `file-upload` provider): the file
contents do briefly leave the device, processed in memory by the server's
`POST /import` and discarded immediately. The mechanism is bounded by
`server/test/unit/privacy-invariants.test.ts` (no queue, table, blob, or
disk imports in `import.ts`; no logging of file content). See
`tasks/50-file-upload-provider.md`.

---

## Motivation

Burrito already has a clean plugin shape on the AI side: `models.config.json`
declares the available models, `client.ts` dispatches by `provider`, and adding
a model is "edit JSON + (sometimes) add a code path." Adding a new ingest
source today has no equivalent — GitHub-specific assumptions would leak into
the sync worker, the OAuth flow, the identity model, and the dedup contract.

This document defines a **Contribution Provider** abstraction that gives every
data source (GitHub, GitLab Dedicated, Jira, Slack, Confluence, …) the same
plugin-style shape, while keeping the local-first, encrypted-at-rest, no-server-
persistence guarantees the rest of the codebase enforces.

The design goal is: shipping a new provider should be (a) a new folder under
`src/lib/providers/<id>/`, (b) a new entry in `providers.config.json`, and
(c) one import line in `src/lib/providers/index.ts`. Nothing else.

## The pattern in one paragraph

A provider is a pure module that knows how to do four things for one external
system: **connect** (turn user consent into tokens), **identify** (turn tokens
into a stable external user ID), **sync** (turn tokens + a cursor into a
stream of raw events), and **normalize** (turn raw events into canonical
`Contribution` rows). Storage, encryption, scheduling, and UI are the
orchestrator's job, not the provider's. Providers never touch the local store
directly — same import-boundary rule that already protects `src/lib/ai/**`.

## Module layout

```
src/lib/providers/
  types.ts                       Interface + shared types
  registry.ts                    In-memory registry; getProvider(id)
  config.ts                      Loads + Zod-validates providers.config.json
  providers.config.json          Per-provider client IDs, scopes, instance rules
  index.ts                       Side-effect imports of each provider
  auth/
    pkce.ts                      Shared PKCE helpers
    loopback.ts                  Localhost one-shot redirect listener (browser)
    deeplink.ts                  Custom-scheme handler (Tauri)
    redirect.ts                  RedirectHandler interface + factory
  gitlab-dedicated/
    index.ts                     Registers the provider
    auth.ts                      OAuth PKCE adapter
    client.ts                    Thin wrapper over /api/v4 + /oauth
    sync.ts                      Cursor-based event stream
    normalize.ts                 GitLab event → Contribution[]
    types.ts                     GitLab-specific raw event shapes
  github/
    ...
  jira-cloud/
    ...
```

`providers/types.ts` defines the contract. `providers/registry.ts` is a tiny
`Map<string, ContributionProvider>`. `providers/index.ts` is the only place
that imports concrete providers — importing it has the side effect of
populating the registry. The orchestrator imports from `registry.ts`, never
from a specific provider folder.

## The contract

```ts
// src/lib/providers/types.ts

export interface ContributionProvider {
  readonly id: string;                    // 'gitlab-dedicated'
  readonly displayName: string;
  readonly capabilities: ProviderCapabilities;
  readonly auth: AuthAdapter;
  readonly identity: IdentityAdapter;
  readonly sync: SyncAdapter;
}

export interface ProviderCapabilities {
  requiresInstanceUrl: boolean;           // true: GitLab Dedicated, Jira DC
  fixedInstanceUrl?: string;              // e.g. 'https://github.com'
  supportsRevocation: boolean;
  supportsIncrementalSync: boolean;
  // Default scopes; can be narrowed per-instance via config
  defaultScopes: readonly string[];
}

// --- Auth -----------------------------------------------------------------

export type AuthAdapter =
  | OAuthPkceAdapter
  | ApiTokenAdapter;

export interface OAuthPkceAdapter {
  kind: 'oauth-pkce';
  begin(args: {
    instanceUrl: string;
    redirectUri: string;
    scopes: readonly string[];
  }): Promise<{
    authorizationUrl: string;
    state: string;
    codeVerifier: string;
  }>;
  exchange(args: {
    instanceUrl: string;
    code: string;
    codeVerifier: string;
    redirectUri: string;
  }): Promise<TokenSet>;
  refresh(args: { instanceUrl: string; tokens: TokenSet }): Promise<TokenSet>;
  revoke(args: { instanceUrl: string; tokens: TokenSet }): Promise<void>;
}

export interface ApiTokenAdapter {
  kind: 'api-token';
  // For providers that only support PATs (e.g. some on-prem Jira).
  validate(args: { instanceUrl: string; token: string }): Promise<TokenSet>;
}

export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;                     // epoch ms; undefined = never
  scopes: readonly string[];
  obtainedAt: number;
}

// --- Identity -------------------------------------------------------------

export interface IdentityAdapter {
  resolve(args: {
    instanceUrl: string;
    tokens: TokenSet;
  }): Promise<ExternalIdentity>;
}

export interface ExternalIdentity {
  providerId: string;                     // mirrors ContributionProvider.id
  instanceUrl: string;                    // canonical URL, no trailing slash
  externalUserId: string;                 // STABLE — never email, never username
  username?: string;
  email?: string;
  displayName?: string;
  raw?: unknown;                          // provider-specific extras (no PII required)
}

// --- Sync -----------------------------------------------------------------

export interface SyncAdapter {
  run(args: {
    instanceUrl: string;
    identity: ExternalIdentity;
    tokens: TokenSet;
    cursor: SyncCursor | null;
    signal: AbortSignal;
    onTokensRefreshed?: (next: TokenSet) => Promise<void>;
  }): AsyncIterable<RawEvent>;
  normalize(args: {
    event: RawEvent;
    identity: ExternalIdentity;
  }): Contribution[];
  externalIdFor(event: RawEvent): string;
}

export type SyncCursor = Record<string, unknown>;   // opaque, provider-shaped

export interface RawEvent {
  // Whatever the provider returns. Stays in-process; never persisted raw.
  type: string;
  occurredAt: number;
  payload: unknown;
}
```

A few non-obvious choices and why:

`AuthAdapter` is a discriminated union rather than a flat set of methods so a
PAT-only provider can't accidentally claim it supports refresh. The orchestrator
narrows on `kind` and gets a type-checked subset.

`onTokensRefreshed` is a callback rather than a return value because GitLab's
refresh tokens are single-use — the new pair must be persisted *before* the
next call, even mid-stream during a long sync. Having it as a callback lets
the orchestrator persist atomically without the provider needing to know
about storage.

`SyncCursor` is opaque to the orchestrator. Each provider defines its own
cursor shape (`{ updatedAfter: ISO, page: number }` for GitLab,
`{ etag: string, since: ISO }` for GitHub) and parses it on its own. The
orchestrator just round-trips it to the local store as JSON.

`RawEvent.payload` is `unknown` deliberately. Providers should not stuff
provider-specific types into the orchestrator's view. Anything the
orchestrator needs goes through `normalize()`.

## Configuration

`providers.config.json` describes per-provider, per-instance settings that an
operator might want to change without touching code:

```json
{
  "providers": [
    {
      "id": "gitlab-dedicated",
      "label": "GitLab Dedicated",
      "clientId": "wrapped-for-work-public",
      "scopes": ["read_api", "read_user", "openid", "profile"],
      "requiresInstanceUrl": true
    },
    {
      "id": "github",
      "label": "GitHub",
      "clientId": "Iv1.xxxxxxxxxxxx",
      "scopes": ["read:user", "repo"],
      "requiresInstanceUrl": false,
      "fixedInstanceUrl": "https://github.com"
    }
  ]
}
```

Validated with Zod at import time, same shape as `models.config.json`.
Public-client OAuth means no `clientSecret` field anywhere. If a future
provider requires confidential-client OAuth it goes in env vars, never JSON.

## Lifecycle

### Connect

The orchestrator's `connectProvider(providerId, instanceUrl?)` flow:

1. Look up the provider in the registry; read its capabilities and the matching
   config entry.
2. If `requiresInstanceUrl`, prompt for it; validate the URL by hitting the
   provider's unauth health endpoint (e.g. `/api/v4/version` for GitLab).
3. Construct a `RedirectHandler` for the current runtime — `LoopbackRedirectHandler`
   in browser, `DeepLinkRedirectHandler` in Tauri. Both expose
   `{ redirectUri, awaitCallback(), close() }`.
4. Call `provider.auth.begin({ instanceUrl, redirectUri, scopes })`. Open the
   returned `authorizationUrl` in the system browser.
5. Await `redirectHandler.awaitCallback()`; verify `state` matches.
6. Call `provider.auth.exchange(...)` to get a `TokenSet`.
7. Call `provider.identity.resolve(...)` to get an `ExternalIdentity`.
8. Look up `(providerId, instanceUrl, externalUserId)` in the local
   `identities` table:
   - **Match**: rotate tokens for that identity. Don't touch contributions.
   - **No match**: create new identity row. Persist tokens against its id.
9. Schedule the first sync.

The provider sees none of this — it gets parameters in, returns data out. The
RedirectHandler abstraction is what lets the same provider work in browser,
Tauri, and (eventually) a CLI without changes.

### Sync

Driven by the orchestrator on a schedule (`node-cron` while the app is open,
plus a manual "sync now" button). For each enabled identity:

1. Decrypt tokens from the local store.
2. Read the last cursor from `syncState`.
3. If `tokens.expiresAt` is within ~60s of now and the auth adapter supports
   refresh, refresh first; persist the rotated tokens before continuing.
4. Open an `AbortController`. Iterate `provider.sync.run(...)`.
5. For each `RawEvent`, call `provider.sync.normalize(...)` to get
   `Contribution[]`. Upsert into the local store keyed by
   `(identityId, externalId)` — the same dedup contract you already have,
   just scoped to identity.
6. Update the cursor periodically (per-page or per-N-events), not just at the
   end. A long sync that crashes shouldn't lose its place.
7. If the provider calls `onTokensRefreshed`, persist immediately.

If `provider.sync.run` throws auth errors (401/403), surface to the UI and
stop. If it throws transient errors (5xx, network), the orchestrator backs
off and retries with the same cursor. The provider does not implement retry
or backoff; the orchestrator owns that policy uniformly.

### Disconnect

`disconnectIdentity(identityId)`:

1. Read tokens.
2. If `auth.kind === 'oauth-pkce'` and `capabilities.supportsRevocation`,
   call `provider.auth.revoke(...)`. Best-effort; tolerate failure.
3. Delete the `tokens` row.
4. Optionally delete the `identities` row and all contributions tagged with
   that `identityId` (settings-page toggle: "remove account vs. forget data").
5. Wipe in-memory caches.

## Storage contract

Three new Dexie tables, all using the existing envelope encryption from
`src/lib/local-store/crypto.ts`:

```
identities {
  id              : local synthetic ULID
  providerId      : string                       (clear, not encrypted — needed for indexing)
  instanceUrl     : string                       (clear, normalized)
  externalUserId  : string                       (clear, needed for dedup lookup)
  envelope        : { iv, ciphertext } over { username, email, displayName, raw, addedAt }
  unique          : (providerId, instanceUrl, externalUserId)
}

tokens {
  id              : local synthetic ULID
  identityId      : foreign key → identities.id  (clear)
  envelope        : { iv, ciphertext } over TokenSet
  unique          : (identityId)                 // one token set per identity
}

syncState {
  identityId      : primary key                  (clear)
  cursor          : JSON                         (encrypted — cursor often contains usernames/IDs)
  lastSyncAt      : number
  lastError       : string | null
}
```

A few fields are stored in the clear deliberately: `providerId`, `instanceUrl`,
`externalUserId`, and `identityId` are needed for indexing and join-style
lookups. They're already implied by the tokens themselves, so encrypting them
adds zero privacy and breaks queryability. Everything else (display names,
emails, payload data, cursors) goes through the envelope.

When Burrito moves to Tauri (v2): the `tokens` table is the *only* thing that
should migrate to the OS keychain via `tauri-plugin-keyring`. `identities` and
`syncState` can stay in IDB. Migration is a one-shot at first Tauri launch:
read encrypted tokens, write to keychain by `identityId`, drop the IDB row.
Everything else in this design is unaffected by that migration — that's the
point of having storage be an orchestrator concern.

## Privacy invariants

Extend `test/unit/privacy-invariants.test.ts` with provider-specific rules:

1. **Provider modules are storage-pure.** `src/lib/providers/**` must not
   import from `src/lib/local-store/*`. (Mirrors the existing `src/lib/ai/**`
   rule.) Providers receive tokens by parameter and return data; the
   orchestrator owns persistence.

2. **No tokens in logs.** Grep `src/lib/providers/**` and
   `src/lib/sync/**` for `console.*` of `token`, `accessToken`, `refresh`,
   `Authorization`, or full request/response objects. CI fails on a hit.

3. **No request-body logging.** Same rule as `client.ts`/`shared.ts`.

4. **API routes stay free of providers.** `src/app/api/**` must not import
   from `src/lib/providers/*` — provider auth and sync run in the browser
   process (or Tauri main), never on the Next API surface. The API surface
   stays stateless and identity-free.

5. **Privacy banner.** Same comment block already required on API routes
   gets required on each provider's `index.ts`.

## Adding a new provider — worked example

Here's what shipping `gitlab-dedicated` looks like end-to-end. This is the
"plugin" experience the pattern is designed around.

**Step 1.** Add the entry in `providers.config.json`:

```json
{
  "id": "gitlab-dedicated",
  "label": "GitLab Dedicated",
  "clientId": "wrapped-for-work-public",
  "scopes": ["read_api", "read_user", "openid", "profile"],
  "requiresInstanceUrl": true
}
```

**Step 2.** Create `src/lib/providers/gitlab-dedicated/`:

- `auth.ts` — implements `OAuthPkceAdapter`. `begin` builds the
  `${instanceUrl}/oauth/authorize?...` URL with PKCE; `exchange` POSTs to
  `/oauth/token`; `refresh` POSTs with `grant_type=refresh_token`; `revoke`
  POSTs to `/oauth/revoke`.
- `client.ts` — small `fetch` wrapper that adds `Authorization: Bearer …`
  and handles GitLab's pagination headers (`X-Next-Page`, `Link`).
- `sync.ts` — generator that yields events from
  `/api/v4/users/:id/events?after=…&page=…`, plus per-project MR/issue
  updates queried by `updated_after=…`. Cursor shape:
  `{ eventsAfter: ISO, projectCursors: Record<projectId, { updatedAfter: ISO }> }`.
- `normalize.ts` — pattern-matches event types (`pushed`, `merged`,
  `commented on`, `created`) into your canonical `Contribution` shape.
- `index.ts` — composes the adapters, registers via
  `registerProvider({ id: 'gitlab-dedicated', ... })`.

**Step 3.** Add one line to `src/lib/providers/index.ts`:

```ts
import './gitlab-dedicated';
```

**Step 4.** Done. The dashboard's "connect account" UI reads from the
registry, so it picks up GitLab Dedicated automatically. The sync orchestrator
treats it identically to every other provider. The privacy invariant tests
cover it because they globbed `providers/**`.

If GitLab Self-Managed (the non-Dedicated edition) needed support later, it's
plausibly the *same* provider — same OAuth shape, same `/api/v4`. The only
thing that changes is what the user types as `instanceUrl`. That's the
abstraction working as intended.

## What's intentionally out of scope for v1

- **Webhook ingest.** Polling only, per the local-first decision. The
  `SyncAdapter` interface doesn't have a webhook hook. If/when we add a
  cloud relay, it'll feed the same `RawEvent` stream from the orchestrator's
  side; the provider interface doesn't need to change.
- **Confidential-client OAuth.** Public-client + PKCE only. Adding a
  `client_secret` flow means key distribution, which means a backend, which
  means we're no longer local-first. If a provider truly requires it (some
  on-prem GitLab installations), they get an `ApiTokenAdapter` instead.
- **Cross-identity merging.** "This GitLab account and this GitHub account
  are the same person, merge their contributions" is a UX-layer concern. The
  storage layer keeps them as separate `identityId`s; merging is a
  presentation-time join.
- **Provider hot-reload.** Adding a provider requires a rebuild. Fine for v1.

## Open questions

- Should `RawEvent.payload` be persisted (encrypted) for replay/debugging, or
  discarded after `normalize`? Storage cost vs. ability to reprocess after a
  prompt change.
- Cursor versioning: if a provider's cursor shape changes between releases,
  do we invalidate or migrate? Probably a `cursorVersion: number` field on
  the cursor itself.
- Where does scope-narrowing live? Per-instance scope overrides feel like
  config, but per-feature ("don't ask for `repo` if user opts out of code
  diffs") feels like a runtime concern. Punting to v2.
