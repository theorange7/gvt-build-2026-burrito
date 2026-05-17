# Spec 61 — Client-side Ollama wrap generation (skip the queue)

**Status**: Shaped — ready to pick up
**Branch**: both (client + small docs touch on server)
**Appetite**: medium-to-large (≤ 4 days — the settings UI + status badge add a half-day on top of the original medium estimate)
**Last shaped**: 2026-05-16 (revised same day to add piece 6: settings UI + status indicator)

## Problem

Spec 60 made Ollama a peer provider in the **server** dispatcher, which
solves the "no outbound spend, no egress to a cloud LLM" question for the
generation step. But for a user who selects an Ollama model from the
dropdown, the request still travels:

```
client → POST /wrap → Service Bus → wrapWorker → callModel → http://localhost:11434
                ↑ poll /wrap/{jobId} every few seconds until done
```

Every hop except the last is cloud-hosted Azure infrastructure (Functions
host, Service Bus, Table Storage). That's:

1. **Operationally wrong for the privacy choice the user made.** Picking
   the local model and then routing through Azure to get back to your
   own laptop is theatre. The egress *risk* is gone (no prompt leaves
   the box during generation), but the *dependency* on cloud uptime is
   identical. A user on a plane, in a vault, or with a flaky home
   internet connection can't regenerate a wrap from data they already
   have locally — even though the LLM is running on the same machine
   as the browser.
2. **Operationally wrong for the Tauri shell** (spec 40). The
   `.dmg`-shipped desktop app's most defensible pitch is "open the app
   on the train, regenerate your wrap, close it." That requires the
   wrap pipeline to terminate inside the device. Today it can't —
   the modal would hang at "queued" with no Functions host to talk to.
3. **A wasted opportunity to demo the architecture.** The codebase
   already separates "what the slice prompt looks like" from "where
   the LLM call happens" (`server/src/ai/shared.ts`'s `createSlice` is
   pure logic over `callModel`). The only reason the prompts can't run
   client-side today is that they import from `server/src/ai/`, which
   is server-only by convention. That's a packaging accident, not an
   architectural constraint.

Spec 60's own **Notes** section identified this as the obvious next
spec — and named the three pieces that would have to move: the
`src/lib/ai/` thinness carve-out, the slice prompts to a shared
package, and the Service Bus / Tables skip. This spec executes that
work as one coherent change.

The framing: when the selected model has `provider: 'ollama'`,
generation runs **entirely in the browser tab**. When the selected
model has any other provider, the current server-queue path stays
untouched. The choice happens at the dispatch seam in
`src/lib/ai/generate.ts`; nothing else in the UI changes.

## Solution shape

Five pieces, in dependency order:

### 1. Move slice prompts + `createSlice` into `@wrapped/shared`

Today `server/src/ai/prompts/*.ts` and `server/src/ai/shared.ts` are
the only piece of generation logic that's *not* in `shared/`. They
were placed in `server/` because they import `callModel` from
`server/src/ai/client.ts`. The fix is a small inversion of control:
`createSlice` already takes a `modelId` argument and threads it into
`callModel(systemPrompt, userMessage, modelId)`. Replace the import
with a **caller-supplied function**:

```ts
// shared/src/ai/createSlice.ts (new)
export type CallModelFn = (systemPrompt: string, userMessage: string, modelId?: string) => Promise<string>;

export const createSlice = async (args: {
  // … same fields as today …
  call: CallModelFn;
}): Promise<SliceContent> => { /* identical body, uses args.call instead of callModel */ };
```

The prompts move to `shared/src/ai/prompts/`. The signature of every
`generate<Slice>` function gains a `call: CallModelFn` parameter,
which their two callers (server `generateWrap`, client
`generateWrapLocally`) inject. No prompt text changes; no slice
fallback semantics change.

`shared/` continues to be runtime-dep-free — it imports nothing from
SDKs, no `fetch`, no env vars. The actual HTTP call is the caller's
problem.

### 2. Add `src/lib/ai/ollama.ts` (thin adapter, no SDK)

A near-twin of `server/src/ai/providers/ollama.ts` from spec 60, but
client-side and SDK-free. Uses global `fetch`. Resolves the base URL
from (in order):

1. `model.baseUrl` from the model entry (client mirror of the server
   models config — see piece 3).
2. `process.env.NEXT_PUBLIC_OLLAMA_BASE_URL` at build time. (No
   `OLLAMA_BASE_URL` runtime env on the client — Next.js inlines
   `NEXT_PUBLIC_*` at build, which is the right shape for static-host
   deployments and for Tauri.)
3. Hard default `http://localhost:11434`.

Surface the same `ollama_unreachable` / `not_found` semantics, but as
typed client errors (no `UpstreamError` class — that lives in
`server/src/privacy.ts` and shouldn't leak across the boundary).
Define a tiny local enum:

```ts
// src/lib/ai/ollama.ts
export type OllamaError =
  | { code: 'ollama_unreachable'; baseUrl: string }
  | { code: 'model_not_found'; modelId: string }
  | { code: 'http_error'; status: number }
  | { code: 'parse_failed' };
```

Retries match the server: `[1000, 2000, 4000]` ms on 429 / 5xx,
fail-fast on connection-refused. Re-use the same fixed schedule —
duplicating three numbers is cheaper than packaging a shared
`RETRY_DELAYS`.

### 3. Client-side model catalog with provider distinction

Today `src/lib/ai/models.ts` loads a JSON list that the **server**
also reads (or rather, the client list is rendered display-only and
the server has its own copy at `server/src/ai/models.config.json` —
the spec author should grep `models.config.json` paths and confirm
how the two stay in sync; if they're already symlinked or copied at
build time, reuse that mechanism).

The client needs to know **`provider`** for each model so the
dispatch in piece 4 can branch. If the existing client model entries
already carry `provider`, that's the seam — read it. If they don't,
add it (the server schema already has it post-spec-60). No new fields
beyond `provider` and (for ollama entries) `baseUrl` — the client
does not need `version`, server-side `parameters`, or any other
server-only knob.

### 4. Dispatch in `src/lib/ai/generate.ts`

`enqueueWrap` gains a sibling `generateWrapLocally` and a branch on
the chosen model:

```ts
// src/lib/ai/generate.ts
export async function startWrap(input: StartWrapInput): Promise<StartWrapResult> {
  const model = resolveModel(input.modelId);
  if (model.provider === 'ollama') {
    return generateWrapLocally(input, model);
  }
  return enqueueWrap(input);
}
```

`generateWrapLocally` does the fan-out client-side using the shared
prompts + the client Ollama adapter, with the same `Promise.allSettled`
+ `fallbackForSlice` discipline as the server `generateWrap`. It
returns a result shaped like an immediately-`complete`
`GetWrapResponse` so the caller (`GenerateWrapModal`) can use the
same downstream code path:

```ts
type StartWrapResult =
  | { kind: 'queued'; jobId: string; busy: boolean }     // server path
  | { kind: 'local-complete'; jobId: string; sliceContent: SliceContent[] };
```

The modal then either:
- `kind: 'queued'`: `addPendingWrap(...)` as today, polling begins.
- `kind: 'local-complete'`: `saveWrap(...)` directly. No pending-wrap
  row. No polling. Navigate straight to `/wrap/{jobId}`.

The `jobId` for the local path is still `crypto.randomUUID()`, so the
URL shape is identical and the local wraps store doesn't need to
distinguish them.

### 5. Privacy invariants extended for the carve-out

CLAUDE.md hard rule 2 today reads: **"Client AI wrappers stay thin.
`src/lib/ai/**` must not import any LLM or Azure SDK (…) and must not
log tokens, request bodies, or signal text."** The new
`src/lib/ai/ollama.ts` does not import any SDK (it uses global
`fetch`), so it doesn't violate the rule as stated — but the spirit
of the rule was "no LLM logic in the client." Update the rule
explicitly:

> 2. **Client AI wrappers stay thin** *except for the local-Ollama
>    branch*. `src/lib/ai/**` must not import any LLM or Azure SDK,
>    must not read server-only env vars, and must not log tokens,
>    request bodies, or signal text. **`src/lib/ai/ollama.ts` and
>    `src/lib/ai/localGenerate.ts` are the documented exceptions: they
>    construct prompts and POST to `localhost:11434`. They still must
>    not import any SDK, must not log prompt content, and must use
>    only `NEXT_PUBLIC_*` env.**

Extend `test/unit/privacy-invariants.test.ts` accordingly:

- The "finds the expected wrapper files" assertion gains `ollama.ts`
  and `localGenerate.ts`.
- A new assertion: `src/lib/ai/ollama.ts` and `localGenerate.ts`
  must not contain `console.log(...)`, `console.info(...)`, or
  similar with `messages`, `systemPrompt`, `userMessage`, `signal`,
  or `contributions` in the argument list.
- A new assertion: the only fetch URLs allowed in
  `src/lib/ai/ollama.ts` are `${baseUrl}/api/chat` (generation) and
  `${baseUrl}/api/tags` (probe — see piece 6). Regex-grep the
  source for `fetch(` calls and assert the literal patterns. This
  guards against a future copy-paste that lets prompt content travel
  to a different URL.

Server-side, only one cosmetic change: the prompt files move out of
`server/src/ai/prompts/` into `shared/src/ai/prompts/`, and
`server/src/ai/generate.ts` imports them from `@wrapped/shared`. The
server `generateWrap` shape is unchanged.

### 6. Settings UI + status indicator

Users need a place to (a) configure their local Ollama endpoint and
preferred model and (b) see at a glance whether their current
session is operating against the local model. Both live on the
existing `/dashboard/settings` page (`SettingsShell.tsx`), gated
behind the unlock flow exactly like provider settings.

**New persisted preferences (Dexie `meta` table):**

```ts
// src/lib/local-store/db.ts — extend META_KEYS
export const META_KEYS = {
  // … existing …
  ollamaBaseUrl: 'ollamaBaseUrl',           // string, e.g. "http://localhost:11434"
  ollamaSelectedModelId: 'ollamaSelectedModelId',  // string, an ollama:* id from the catalog
  ollamaLastProbeAt: 'ollamaLastProbeAt',   // ISO timestamp
  ollamaLastProbeStatus: 'ollamaLastProbeStatus',  // 'ok' | 'unreachable' | 'model_missing'
} as const;
```

`meta` rows go through the same envelope-encryption path as the rest
of the local store. Values are read and written via a tiny
`src/lib/local-store/preferences.ts` module (mirrors `tokens.ts` in
spirit — typed get/set helpers, no schema duplication elsewhere).
None of these keys leave the device; they're never sent to the
server.

**New component — `src/components/settings/LocalOllamaSection.tsx`:**

A section block inserted into `SettingsShell.tsx` between the
header and `<ProvidersList />`. Sketch:

```
┌─────────────────────────────────────────────────────┐
│ LOCAL OLLAMA  ·  Offline-only generation            │
│ ─────────────────────────────────────────────────── │
│ Generation runs entirely on this device. Nothing    │
│ leaves the browser tab when an Ollama model is      │
│ selected.                                           │
│                                                     │
│ Ollama base URL                                     │
│ ┌─────────────────────────────────────────────────┐ │
│ │ http://localhost:11434                          │ │
│ └─────────────────────────────────────────────────┘ │
│                                                     │
│ Default model                                       │
│ ┌─────────────────────────────────────────────────┐ │
│ │ ▼ llama3.1:8b  (Llama 3.1 8B, Ollama local)     │ │
│ └─────────────────────────────────────────────────┘ │
│ Dropdown lists models from the catalog whose        │
│ provider is 'ollama'. If none are configured,       │
│ show: "Add an `ollama:*` entry to your model        │
│ catalog to enable this." (linking to CLAUDE.md).    │
│                                                     │
│ [ Save ]   [ Test connection ]                      │
│                                                     │
│ ✓ Reachable · llama3.1:8b is pulled · checked 2m ago│
│ (or)                                                │
│ ⚠ Unreachable at http://localhost:11434.            │
│   Start it with `ollama serve`.                     │
│ (or)                                                │
│ ⚠ Reachable, but `llama3.1:8b` is not pulled.       │
│   Run: ollama pull llama3.1:8b                      │
└─────────────────────────────────────────────────────┘
```

Behaviour:

- The URL field defaults to whatever's saved in `meta`, falling
  back to `NEXT_PUBLIC_OLLAMA_BASE_URL`, falling back to
  `http://localhost:11434`. Same resolution order as
  `src/lib/ai/ollama.ts`.
- "Save" persists URL + model to `meta` and re-resolves the
  default-model used by `GenerateWrapModal` (see below).
- "Test connection" calls a new helper
  `probeOllama(baseUrl): Promise<ProbeResult>` exported from
  `src/lib/ai/ollama.ts` (alongside the `chat` call). The probe
  hits `GET ${baseUrl}/api/tags` — Ollama's installed-models
  endpoint — and returns `{ ok, models?, error? }` where `models`
  is the list of pulled tags. The result is used both for the
  inline status line ("✓ reachable · `<modelId>` is pulled") and
  to write `ollamaLastProbeAt` + `ollamaLastProbeStatus` to `meta`.
  `model_missing` fires when the probe is reachable but the
  configured `ollamaSelectedModelId`'s `modelId` tag isn't in
  the returned list.
- The probe call itself is also subject to the privacy invariant:
  same `src/lib/ai/ollama.ts` file, same "no console logging"
  rule, same restricted URL allowlist (now `chat` + `tags`).

**New component — `src/components/dashboard/LocalModeBadge.tsx`:**

A compact status chip rendered in the dashboard header
(`DashboardShell.tsx`) and the settings header
(`SettingsShell.tsx`). Three states, derived purely from `meta`
plus the last probe — no on-render network call:

| Condition                                              | Badge                                       |
|--------------------------------------------------------|---------------------------------------------|
| No `ollamaSelectedModelId` in `meta`                   | (no badge — feature is opt-in)              |
| Configured + last probe `ok` within 24h                | `🟢 Local · llama3.1:8b`                    |
| Configured + last probe `unreachable` or `model_missing` | `🔴 Local · check settings`                |
| Configured + no probe yet, or probe > 24h old          | `⚪ Local · not yet checked`                |

Clicking the badge navigates to `/dashboard/settings#local-ollama`
(anchor on the new section). The badge is informational; it does
**not** force the model picker (see Rabbit holes for why).

**Pre-select the configured Ollama model in `GenerateWrapModal`:**

`GenerateWrapModal.tsx` today initialises `modelId` to
`DEFAULT_MODEL_ID`. Update to:

```ts
const [modelId, setModelId] = useState<string>(
  () => preferredLocalModelId() ?? DEFAULT_MODEL_ID,
);
```

where `preferredLocalModelId()` reads `META_KEYS.ollamaSelectedModelId`
synchronously from a small cache populated at provider bootstrap
(same shape as the install-token cache). The dropdown still shows
all models; the user can override per-generation. **No filtering of
non-Ollama entries** — that's spec 60's Rabbit hole.

**Refreshing the probe in the background (small, optional):**

When the dashboard mounts and a local-Ollama preference exists, fire
one `probeOllama` call if `ollamaLastProbeAt` is older than 5 minutes.
Don't block render on it; the badge re-renders when the probe writes
back. This keeps the badge accurate across "I started Ollama after
opening the tab" / "I killed Ollama" without polling. If even this
feels like scope creep, defer — the explicit "Test connection"
button is sufficient for V1.

### What does *not* change

- The model picker UI. The same dropdown surfaces Ollama entries
  exactly as today; selection just routes differently behind the
  scenes. The settings preference *pre-selects* the user's
  preferred Ollama model — it does not filter, hide, or disable
  other entries.
- The wrap viewer (`src/app/wrap/[id]/page.tsx`). It reads from the
  local wraps store via `getWrap(id)` — agnostic to how the
  `sliceContent` got there.
- The encryption-at-rest story. `saveWrap` already envelope-encrypts
  `sliceContent`; the local path uses the same call. The new
  `meta` keys go through the same envelope.
- `pollWrap` and the pending-wraps state machine. Both keep their
  current shape; the local path simply doesn't enter them.
- The server queue, worker, Tables, or Service Bus. They keep
  handling Anthropic / Azure Foundry traffic untouched. Removing
  them is **out of scope** even if every model in the catalog
  becomes Ollama — operators may still want the cloud path for some
  installs.
- `classify.ts`. Spec 60's classification still routes through the
  server's `callClaude` shim. Moving classification client-side is
  trivial after this spec lands (it's one prompt with the same
  pattern), but it's a separate, much smaller spec — keep this one
  focused on wrap generation.

## Rabbit holes

- **Reconciling with spec 60's "no local-mode toggle" guidance.**
  Spec 60 explicitly listed *"Adding a 'local mode' toggle to the UI"*
  as a Rabbit hole because a toggle becomes a second source of truth
  that drifts from the dropdown. This spec **respects that constraint**:
  the new settings panel is a *configuration surface* (URL + preferred
  model + reachability probe), not a mode switch. The status badge is
  *informational* — derived from `meta` plus the last probe — and never
  forces the model picker. The model picker still shows every catalogued
  model; the user remains free to pick a cloud model per generation.
  If you find yourself adding code that filters the dropdown by
  provider, hides cloud models when "offline mode is on," or gates
  the Generate button on Ollama reachability, you've slid into the
  rabbit hole — back out.

- **Streaming responses.** Same trap as spec 60: Ollama supports
  `stream: true`, the UI could render slices progressively. Tempting
  because client-local generation is the natural place to add it
  (no Service Bus boundary to refactor). Wrong for this spec because
  the shared `createSlice` returns a single `SliceContent`; adopting
  streaming means redesigning the contract for both server and client
  callers. Land the dispatch first, revisit streaming as a separate
  spec with a measured "is this actually nicer?" check.

- **Continuous polling of `/api/tags` to keep the badge live.**
  Tempting because it would auto-detect "I just killed Ollama" without
  user action. Wrong because (a) it adds a background network call on
  every dashboard render, (b) it complicates the privacy invariant —
  is a 5-second `tags` poll really "thin"? — and (c) it's a battery /
  CPU tax for a feature with rare state changes. The on-mount probe
  (≤ 1 call when older than 5 minutes) plus the explicit "Test
  connection" button is enough. If users complain the badge is stale,
  add a manual refresh icon next to it before reaching for polling.

- **Storing the preferred model as a model-id reference instead of
  a snapshot.** If the user picks `ollama:llama3.1-8b` in settings and
  later removes that entry from the catalog, the preference dangles.
  Don't try to "snapshot" the model entry into `meta` — instead, when
  resolving `preferredLocalModelId()`, validate against the live
  catalog and clear the preference (and surface a one-time toast in
  settings) if the id no longer resolves. Same pattern as a token
  whose identity has been revoked.

- **Letting the settings panel write the catalog itself.** The catalog
  (`src/lib/ai/models.ts` / `server/src/ai/models.config.json`) is
  operator-controlled and ships with the deploy. The settings panel
  *reads* the catalog (filtered to ollama entries) for the dropdown;
  it does **not** add, edit, or remove entries. A "manage models from
  the UI" spec is a separate, larger piece — and probably belongs on
  the server (the catalog is the operator's contract, not the user's).

- **Putting the test-connection result anywhere except the settings
  panel + `meta`.** Tempting to fire a toast at the top of the
  dashboard ("Ollama is now reachable!"). Don't — the badge already
  communicates state, toasts are noisy, and "is Ollama up?" is a
  question only the settings page should answer authoritatively.

- **An "offline mode" CSS theme.** It would be visually satisfying to
  tint the dashboard a different colour when the local-mode badge is
  green. Don't — the existing design system is already loaded;
  conditional theming is a maintenance tax with no functional payoff.
  A single badge in the header is enough.

- **Sharing the model catalog as one file across client and server.**
  Today the server has `server/src/ai/models.config.json` and the
  client has its own `src/lib/ai/models.ts` (rendering only). The
  shared package would be the obvious home, but the schemas diverge:
  the server needs `parameters`, `version`, server-only knobs; the
  client needs `provider` and (for ollama) `baseUrl`. Unifying them
  is a separate small spec — for this spec, just make sure the
  client catalog carries `provider` for every entry.

- **Making the local path the default for fresh clones.** No. The
  current default (server-queue with `azure:claude-haiku-4-5`)
  matches the cloud-first deployment story. Operators opt into the
  local path by adding an `ollama:*` entry and the user selecting it
  in the picker. A "use local by default if available" toggle is a
  third source of truth on top of the dropdown — same drift problem
  spec 60's Rabbit holes already called out.

- **Auto-detecting browser-side whether Ollama is reachable, then
  hiding or graying out Ollama entries in the dropdown.** Looks
  helpful. Wrong because every page load would now make a probe
  request to `localhost:11434`, which (a) is one more thing to
  mock in tests, (b) makes the dropdown render asynchronously, and
  (c) tells you nothing useful — the model might be reachable but
  not pulled. Let the failure surface in the generate flow with the
  same hint text spec 60 ships server-side.

- **Pushing the import-time JSON schema validation that
  `server/src/ai/models.ts` does at server boot into the client.**
  The client catalog today is display-only; adding Zod validation
  at module load is fine but unnecessary scope. The shape contract
  is already enforced by TypeScript types; runtime validation is a
  defense-in-depth nicety that can land separately.

- **Re-using `src/lib/local-store/` from `src/lib/ai/localGenerate.ts`
  to fetch contributions instead of having the component pass them
  in.** Crosses CLAUDE.md hard rule 4. The component
  (`GenerateWrapModal`) already calls `listContributionsInRange`
  today before passing to `enqueueWrap` — keep that bridging there,
  preserve the invariant.

- **A "local mode" branch in `endpoint.ts`.** `endpoint.ts`
  already has a comment ("This file is also the future seam for a
  'bring-your-own-model' client-only flow") that suggests
  short-circuiting `authHeader()` / `getBackendUrl()` for the local
  path. Don't. The dispatch decision belongs higher up, in
  `generate.ts` (piece 4), where the model object is in scope.
  `endpoint.ts` stays a pure resolver for the server URL + token.

- **Cross-tab generation locks.** A user might open two tabs and
  start two local wrap generations against the same Ollama instance.
  Ollama serializes its own queue, so the requests don't collide;
  the worst case is "the second tab's generation feels slow." The
  server's `concurrency.ts` per-install caps exist to protect cloud
  spend, which doesn't apply locally. Skip.

## No-gos

- **Removing the server queue path.** Even if every model in the
  catalog were ollama (no fresh clone ships that way; operators
  opt in), keep `/wrap`, the worker, and the pending-wraps flow.
  They serve the Anthropic / Azure cases and are the only path
  that works when the client can't reach localhost (e.g. a hosted
  preview deployment for ops review).

- **A new `/wrap-local` HTTP route on the server.** The whole point
  is to not talk to the server. If you find yourself adding a route,
  you're off the rails.

- **Letting prompt text or contribution data appear in any
  `console.*` call from `src/lib/ai/localGenerate.ts` or
  `src/lib/ai/ollama.ts`.** Same rule as the server adapters.
  Errors flow through typed `OllamaError` values; if you want
  observability, attach a structured event to the local store
  (encrypted-at-rest), not a console log.

- **Making `shared/` depend on `fetch`, `node:fetch`, an HTTP
  client library, or any LLM SDK.** `shared/` stays runtime-dep-free.
  The whole `CallModelFn` indirection exists precisely so the wire
  call stays on the edge (server provider adapter or client Ollama
  adapter), never inside the shared prompt logic.

- **Persisting Ollama responses or prompts to any storage other than
  the encrypted local wraps store.** No analytics queue, no debug
  buffer, no Sentry breadcrumb.

- **A `models.config.json` schema breaking change on the server.**
  The server config keeps its current shape post-spec-60. The
  client catalog evolves independently for this spec; a unification
  spec is a separate, later item.

- **Falling back from local Ollama to the server queue on failure.**
  Same reason spec 60 forbids the server-side fallback: if the user
  picked an Ollama model, they made a privacy choice — surface the
  failure with the existing fallback-slice placeholder, do not
  silently re-route to a cloud provider.

- **Adding any `process.env.*` read to a file under `src/lib/ai/`
  that isn't `NEXT_PUBLIC_*`.** Server-only env stays on the server.

- **Sending the configured `ollamaBaseUrl`, the selected model id,
  or the probe result to the server in any request.** None of these
  fields belong on the wire. They live in `meta`, encrypted at rest,
  read only by client code. The `/wrap` enqueue payload's existing
  shape is unchanged; the new settings preferences are invisible to
  the server.

- **A "force offline mode" toggle that disables the cloud model
  entries in the picker.** This is the rabbit hole spec 60 named and
  this spec re-affirms. The settings panel is a configuration
  surface, not a mode switch. Per-generation choice stays in the
  dropdown.

- **A second status badge for the cloud path** ("☁ Cloud · azure-foundry").
  Asymmetric on purpose: the cloud path is the default and the absence
  of a badge means "nothing special is happening." Adding a cloud
  badge clutters the header for the common case to gain nothing.

## Verification

- **Shared prompt move**:
  - `pnpm typecheck` passes at both root and `server/`.
  - `pnpm test` at `server/` still shows 10 slices in stable order
    in `test/unit/generate.test.ts`.
  - `grep -r "server/src/ai/prompts" server/ src/` returns nothing
    (the path is gone).

- **Client Ollama adapter** (`test/unit/ai/ollama.test.ts`, new):
  - POSTs to `${baseUrl}/api/chat` with `stream: false`, threads
    `model.parameters` into `options`, no `Authorization` header.
  - `NEXT_PUBLIC_OLLAMA_BASE_URL` is honoured when set; per-model
    `baseUrl` wins over the env.
  - Connection-refused → typed `OllamaError({ code: 'ollama_unreachable',
    baseUrl })`.
  - 404 → typed `OllamaError({ code: 'model_not_found', modelId })`.
  - 429 / 5xx retry with the matching schedule.

- **Local fan-out** (`test/unit/ai/localGenerate.test.ts`, new):
  - Returns 10 slices in the same stable order as the server.
  - One slice failing falls back to `fallbackForSlice` via
    `Promise.allSettled`; never throws to the caller.
  - Uses the **same** prompt source as the server (asserted by a
    unit test that imports the prompt builder from `@wrapped/shared`
    and snapshots one full system+user message).

- **Dispatch** (`test/unit/ai/generate.test.ts`, extended):
  - Selecting an `azure-foundry` model still calls `enqueueWrap`
    and never touches `localhost:11434`.
  - Selecting an `ollama` model never calls `fetch(backendUrl(...))`.
    Asserted with MSW recording — zero requests to
    `NEXT_PUBLIC_WRAP_API_URL`.

- **Modal integration** (`test/component/GenerateWrapModal.test.tsx`,
  extended):
  - `kind: 'queued'` path: `addPendingWrap` is called, polling
    starts (existing behaviour).
  - `kind: 'local-complete'` path: `saveWrap` is called directly,
    `addPendingWrap` is **not** called, the modal navigates to
    `/wrap/{jobId}`.
  - When `META_KEYS.ollamaSelectedModelId` is set, the modal opens
    with that model pre-selected; when it's unset, the modal opens
    with `DEFAULT_MODEL_ID` (existing behaviour preserved).
  - The dropdown still lists every entry from the catalog regardless
    of the preference (Rabbit hole: no provider filtering).

- **Probe helper** (`test/unit/ai/ollama-probe.test.ts`, new):
  - `probeOllama('http://localhost:11434')` GETs `/api/tags`,
    parses the response, returns `{ ok: true, models: [...] }`.
  - Connection-refused → `{ ok: false, error: { code: 'ollama_unreachable', baseUrl } }`.
  - HTTP 5xx → `{ ok: false, error: { code: 'http_error', status } }`.
  - Sends no `Authorization` header. (Mirrors the chat-call assertions.)

- **Preferences module** (`test/unit/local-store/preferences.test.ts`,
  new):
  - `setOllamaPreferences({ baseUrl, modelId })` writes to `meta`
    through the same envelope-encryption path as the rest of the
    store (raw IDB rows opaque).
  - `getOllamaPreferences()` round-trips the values.
  - `recordOllamaProbe({ status })` persists `ollamaLastProbeAt` +
    `ollamaLastProbeStatus`; subsequent reads reflect the result.
  - Unsetting a preference (e.g. removing the model id) actually
    clears the `meta` row — it doesn't leave a stale value behind.

- **Settings panel** (`test/component/LocalOllamaSection.test.tsx`,
  new):
  - Initial render reflects existing `meta` values (URL +
    model + last probe status).
  - Save persists URL + modelId to `meta` via the preferences
    module; the form does not write directly to Dexie.
  - "Test connection" with a mocked-OK Ollama populates the
    success line and writes `ollamaLastProbeStatus = 'ok'`.
  - "Test connection" with a mocked-unreachable Ollama renders
    the unreachable hint *naming the configured baseUrl* and
    writes `ollamaLastProbeStatus = 'unreachable'`.
  - "Test connection" with a reachable Ollama but a missing tag
    renders the `ollama pull <modelId>` hint and writes
    `ollamaLastProbeStatus = 'model_missing'`.
  - When the catalog has zero `ollama:*` entries, the model
    dropdown is replaced with the "add an entry to your catalog"
    helper text and the Save button is disabled.

- **Status badge** (`test/component/LocalModeBadge.test.tsx`, new):
  - No `ollamaSelectedModelId` in `meta` → renders nothing.
  - Configured + recent (< 24h) `ok` probe → renders green badge
    with the configured `modelId`.
  - Configured + last probe `unreachable` or `model_missing` →
    renders red "check settings" badge linking to
    `/dashboard/settings#local-ollama`.
  - Configured + no probe or > 24h-old probe → renders the
    neutral "not yet checked" badge.
  - The badge does **not** make a network call on render — only
    the explicit "Test connection" button or the optional
    dashboard-mount probe does.

- **E2E** (`test/e2e/`, one new spec):
  - Open `/dashboard/settings`, fill in URL + select an Ollama
    model, click "Test connection" against an MSW-mocked Ollama,
    see the success line, return to the dashboard, observe the
    green `🟢 Local · <modelId>` badge.
  - Open `GenerateWrapModal`: the configured Ollama model is the
    default selection. Click "Generate," see no `/wrap` request
    to the backend, land on a fully-rendered wrap page within the
    e2e timeout.
  - The existing locality / encryption-at-rest invariants still
    pass — `sliceContent` lands in IndexedDB encrypted, no
    identifiers appear in any outbound request. The Ollama
    preferences in `meta` are also encrypted-at-rest (raw IDB
    rows opaque).

- **Privacy invariants** (`test/unit/privacy-invariants.test.ts`,
  extended per piece 5):
  - The "expected wrapper files" list includes `ollama.ts` and
    `localGenerate.ts`.
  - Banned-log patterns extend to the new files.
  - The only `fetch(...)` URL literals in `src/lib/ai/ollama.ts`
    are `${baseUrl}/api/chat` and `${baseUrl}/api/tags`. No
    other URL pattern is permitted in that file.
  - The `/wrap` enqueue payload contract (no `ollamaBaseUrl`, no
    `ollamaSelectedModelId`, no probe status) is asserted in the
    same e2e network-minimality check that already runs.

- **Tauri smoke** (manual runbook in `tasks/runbooks/`, not
  automated): build a Tauri shell with `NEXT_PUBLIC_OLLAMA_BASE_URL`
  unset and `NEXT_PUBLIC_WRAP_API_URL` pointed at a non-routable
  address. Confirm: dashboard loads, a wrap with an Ollama model
  selected generates against the host's Ollama and renders. Pair
  with spec 40's bring-up notes.

## Notes

- **Pairs with spec 40 (Tauri 2 macOS shell).** Spec 40 is the
  "ship the .dmg" story; this spec is what makes the .dmg useful
  without a backend deployment. If 40 is in flight, sequence this
  so both land in the same release — the marketing claim "fully
  offline desktop wrap experience" requires both.

- **Pairs with the file-upload provider (spec 50).** Together, 50
  + 61 give a user a complete cloud-free loop: paste a JSON blob,
  generate a wrap, view it, never touch the internet. Worth a
  paragraph in the README's "Local-first?" section once both land.

- **Does not subsume spec 60.** Spec 60 is still the only path that
  makes sense for an operator who runs the Functions host on the
  same LAN as Ollama (homelab, Tauri's bundled-server mode). Both
  paths coexist: server-side adapter for the queue flow, client-side
  adapter for the skip-queue flow. The dispatch decision in piece 4
  is what makes the choice — not a global toggle.

- **Open follow-ups raised by this work** (parking lot for
  `Tasks.md`, not specs yet):
  - Move `classify.ts` to the same shared-prompt + client-adapter
    pattern. One file, two callers, trivially small.
  - Unify the client and server model catalogs into a single
    `@wrapped/shared` source of truth, gated by what each side
    actually needs.
  - A small in-memory queue inside the browser tab if a user starts
    two wraps in quick succession (rare; Ollama serializes anyway).
  - User-editable model catalog (CRUD on `ollama:*` entries from the
    settings panel) — would let a user add `mistral:7b` without
    redeploying. Larger spec; needs to decide whether the catalog
    becomes meta-table-owned or stays operator-deployed with a
    user-override layer on top.
  - Periodic background re-probe on a long interval (15+ minutes)
    if usage data shows the staleness UX is annoying.
  Defer all of these.

- **The "status badge in the dashboard header" follow-up from spec 60
  is folded into this spec** (piece 6). Spec 60's Notes mentioned it
  as a defer; once we have a settings panel to anchor it to, the badge
  has a real home and a real on-click destination, which it didn't have
  before.

- **Cross-reference: spec 60's "Notes" section already named this
  spec.** Quoting the relevant fragment so the design rationale
  stays linked:

  > The bigger, more interesting design — **client talks to Ollama
  > directly, bypassing the server's `/wrap` queue entirely** — is
  > a separate future spec. That path would:
  > - Carve out a documented exception in CLAUDE.md hard rule 2
  >   (the thinness invariant), since `src/lib/ai/` would gain an
  >   Ollama HTTP client.
  > - Move slice prompt construction into `shared/` (or a new
  >   `prompts/` package) so the same fan-out logic runs in both
  >   environments.
  > - Skip the Service Bus / Table Storage pipeline entirely when
  >   an Ollama model is selected, removing the only remaining
  >   server hop for fully-local users.
