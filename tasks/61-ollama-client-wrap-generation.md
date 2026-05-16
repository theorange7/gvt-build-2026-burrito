# Spec 61 — Client-side Ollama wrap generation (skip the queue)

**Status**: Shaped — ready to pick up
**Branch**: both (client + small docs touch on server)
**Appetite**: medium (≤ 3 days)
**Last shaped**: 2026-05-16

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
- A new assertion: the *only* fetch URL allowed in
  `src/lib/ai/ollama.ts` is `${baseUrl}/api/chat` (regex-grep the
  source for `fetch(` calls and assert the literal pattern). This
  guards against a future copy-paste that lets prompt content travel
  to a different URL.

Server-side, only one cosmetic change: the prompt files move out of
`server/src/ai/prompts/` into `shared/src/ai/prompts/`, and
`server/src/ai/generate.ts` imports them from `@wrapped/shared`. The
server `generateWrap` shape is unchanged.

### What does *not* change

- The model picker UI. The same dropdown surfaces Ollama entries
  exactly as today; selection just routes differently behind the
  scenes.
- The wrap viewer (`src/app/wrap/[id]/page.tsx`). It reads from the
  local wraps store via `getWrap(id)` — agnostic to how the
  `sliceContent` got there.
- The encryption-at-rest story. `saveWrap` already envelope-encrypts
  `sliceContent`; the local path uses the same call.
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

- **Streaming responses.** Same trap as spec 60: Ollama supports
  `stream: true`, the UI could render slices progressively. Tempting
  because client-local generation is the natural place to add it
  (no Service Bus boundary to refactor). Wrong for this spec because
  the shared `createSlice` returns a single `SliceContent`; adopting
  streaming means redesigning the contract for both server and client
  callers. Land the dispatch first, revisit streaming as a separate
  spec with a measured "is this actually nicer?" check.

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

- **E2E** (`test/e2e/`, one new spec):
  - With an `ollama:*` entry in the client catalog and an MSW
    intercept of `localhost:11434/api/chat`, the user can click
    "Generate," see no `/wrap` request to the backend, and land
    on a fully-rendered wrap page within the e2e timeout.
  - The existing locality / encryption-at-rest invariants still
    pass — `sliceContent` lands in IndexedDB encrypted, no
    identifiers appear in any outbound request.

- **Privacy invariants** (`test/unit/privacy-invariants.test.ts`,
  extended per piece 5):
  - The "expected wrapper files" list includes `ollama.ts` and
    `localGenerate.ts`.
  - Banned-log patterns extend to the new files.
  - `src/lib/ai/ollama.ts`'s only `fetch(...)` argument literal is
    `${baseUrl}/api/chat`.

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
  - Surface a status badge in the dashboard header: "Ollama
    reachable / unreachable" — once we're confident the probe is
    cheap and doesn't surprise users. Today's design defers this to
    the generate flow's error path.
  - A small in-memory queue inside the browser tab if a user starts
    two wraps in quick succession (rare; Ollama serializes anyway).
  Defer all of these.

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
