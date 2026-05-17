# CLAUDE.md

Guide for Claude Code (and other agents) working in this repo.
Keep it short — the README and ARCHITECTURE.md carry the prose.

## What this app is

**Wrapped for Work** — a local-first Next.js app that turns engineering
contribution data into a Spotify-Wrapped-style year-end recap.

Two independently deployed packages:

- **Client** (`/`): Next.js 15 (App Router) + React 19 + Tailwind + Framer Motion.
  Local store: Dexie (IndexedDB) with envelope-encrypted records (AES-GCM-256
  + PBKDF2-SHA-256, 600k iterations). `src/lib/ai/` is a thin HTTP wrapper
  that forwards calls to the backend — it holds no LLM credentials and imports
  no SDK.
- **Server** (`server/`): Azure Functions (Node 20) that own all LLM and queue
  logic. Functions: `POST /classify`, `POST /wrap` (enqueue), `GET /wrap/{jobId}`
  (poll), `POST /auth/register`. Generation is async: the enqueue call pushes a
  Service Bus message; a worker function runs the 10-slice fan-out and writes
  the result to Azure Table Storage.
- **Shared** (`shared/`): types-only package (`@wrapped/shared`) imported by
  both client and server.
- Shipping target v2: Tauri 2 macOS shell (`src-tauri/`).

## Commands

```bash
# Client (root)
pnpm install
pnpm dev               # NODE_ENV=development next dev (expects server on :7071)
pnpm build             # next build
pnpm typecheck         # tsc --noEmit  (run before committing)
pnpm lint              # next lint
pnpm test              # vitest run (unit + integration with MSW mocks)
pnpm test:watch
pnpm test:e2e          # playwright (boots dev server)
pnpm export:demo       # regenerate public/demo-contributions.json
pnpm tauri:dev         # native shell dev, requires Rust
pnpm tauri:build       # ships .dmg  (set NEXT_PUBLIC_WRAP_API_URL first)
pnpm tauri:check       # cargo check — CI-safe, no window opened

# Server (Azure Functions)
cd server
pnpm install
pnpm typecheck         # tsc --noEmit
pnpm test              # vitest run
pnpm ai:test           # integration smoke against mocked Anthropic
pnpm ai:test:live      # same suite against real Anthropic (needs key)
func start             # start Functions host on :7071 (requires Azure Functions Core Tools)
```

## Repo layout

```
src/                         Next.js client
  app/
    dashboard/page.tsx        Gated entry point
    wrap/[id]/page.tsx        Renders a saved wrap
    layout.tsx, page.tsx, providers.tsx
  components/
    dashboard/                Shell, manual-input form, contribution feed,
                              generate-wrap modal (model picker lives here)
    slides/                   One component per slice + SlideFrame
    unlock/UnlockGate.tsx     Passphrase gate (setup + unlock)
    wrap/                     WrapExperience, WrapViewer
  lib/
    ai/                       Thin HTTP wrappers — no LLM SDK, no credentials
      endpoint.ts             Resolves NEXT_PUBLIC_WRAP_API_URL + install-token header
      classify.ts             POST /classify → ClassifyResponse
      generate.ts             POST /wrap (enqueue) + GET /wrap/{jobId} (poll)
      models.ts               Loads + Zod-validates models.config.json (display only)
    local-store/
      crypto.ts               AES-GCM/PBKDF2 + in-memory key + idle lock
      db.ts                   Dexie schema + envelope row types
      contributions.ts        add/list/range queries (encrypts on write)
      wraps.ts                save/get wraps (encrypts sliceContent)
      seed.ts                 First-run demo seeding from public JSON
      tokens.ts               Per-install JWT storage and auto-register
      hooks.ts, platform.ts, index.ts
    providers/                Contribution import providers (GitHub, GitLab, …)
    types.ts                  Domain types
server/                      Azure Functions backend
  src/
    ai/
      client.ts               callModel — provider dispatch + retry
      models.ts               Loads + Zod-validates models.config.json
      models.config.json      EDIT THIS to add/remove/retune models
      classify.ts             Single-signal classification
      generate.ts             Fan-out across 10 slice generators
      shared.ts               createSlice helper used by every prompt
      prompts/                One file per slice; builds the user message
    auth/
      jwt.ts                  Sign/verify per-install JWTs (WRAP_JWT_SECRET)
      middleware.ts           requireInstallToken — used by every function
      rateLimit.ts            In-process IP rate limiter for /auth/register
    functions/
      authRegister.ts         POST /auth/register
      classify.ts             POST /classify
      wrapEnqueue.ts          POST /wrap
      wrapGet.ts              GET /wrap/{jobId}
      wrapWorker.ts           Service Bus trigger — runs generation, writes result
    queue/
      concurrency.ts          Per-install and global cap helpers
      jobs.ts                 Azure Table Storage CRUD for wrapJobs
      results.ts              Azure Table Storage CRUD for wrapResults
      serviceBus.ts           Enqueue/receive helpers
    privacy.ts                safeError — strips PII from error objects before logging
    index.ts                  Function registrations entry-point
  host.json                   Functions host config (extension bundle, logging)
  local.settings.json.example Copy → local.settings.json for local dev
shared/                      @wrapped/shared — types + Zod schemas, no runtime deps
  src/
    types.ts                  Domain types shared between client and server
    schemas.ts                Zod schemas for cross-boundary validation
infra/                       Terraform — Azure Functions, Service Bus, Tables, Key Vault
src-tauri/                   Tauri 2 shell (macOS)
tasks/                       Shaped task specs (see "Shaped task specs" below)
test/
  unit/, component/, integration/, e2e/, fixtures/, mocks/, setup/
public/demo-contributions.json   Bundled demo data (134 entries)
```

## Shaped task specs

The `tasks/` directory holds **shaped work** — solution proposals already
discussed with a human, ready for an agent to pick up. Each spec covers one
concrete piece of work with its problem, chosen solution shape, explicit
no-gos, and verification criteria. Format and per-spec status live in
`tasks/README.md`.

When the user asks for "task N" or "spec N":

1. **Read `tasks/<N>-*.md` end to end before writing any code.** The
   "Solution shape" section is the agreed design — execute against it.
2. **Stay inside the shape.** Do not redesign. Do not expand scope. The
   "Rabbit holes" section calls out specific traps; "No-gos" are hard
   boundaries.
3. **Respect the `Branch` field.** Specs say which branch they belong on
   (server / client / both / docs-only). Don't mix work across branches.
4. **Update `Status`** in the spec file as you progress (`Shaped — ready`
   → `In progress` → `Done` with a PR link). Update the index table in
   `tasks/README.md` to match.
5. **When you open the PR, mark the spec done in that same PR.** Flip
   `Status` to `Done`, append a `## Done` block to the spec file
   (Completed date / PR / one-paragraph summary including any deviation
   from the shape), update the `tasks/README.md` index row, and add a
   dated entry to `tasks/CHANGELOG.md`. All four edits land in the PR
   that implements the spec — not a follow-up.
6. **Discoveries that don't fit the current spec** go under the spec's
   `Notes` section as bullets, not into the implementation.

`tasks/` is for shaped work; `Tasks.md` (root, separate file) is the
informal todo parking lot. Promote a `Tasks.md` bullet to a spec only after
a real design conversation.

## Hard rules

These are encoded as static-analysis tests in
`test/unit/privacy-invariants.test.ts` (client) and
`server/test/unit/privacy-invariants.test.ts` (server). Breaking them fails CI.

1. **`src/app/api/` must not exist.** API routes have moved to `server/`. The
   client invariant test asserts the directory is absent.
2. **Client AI wrappers stay thin.** `src/lib/ai/**` must not import any LLM or
   Azure SDK (`@anthropic-ai/sdk`, `@azure/*`, `openai`, `jose`), must not read
   server-only env vars (`ANTHROPIC_API_KEY`, `AZURE_*`, `WRAP_JWT_SECRET`), and
   must not log tokens, request bodies, or signal text.
3. **No leaking identifiers.** The `/wrap` enqueue payload omits `userId`, `id`,
   and `externalId`. The e2e suite asserts this.
4. **Local-store imports stay browser-side.** `src/lib/ai/**` must not import
   anything under `src/lib/local-store/`. Within `src/lib/providers/`, only
   `orchestrator.ts` may import local-store.
5. **`shared/` is types-only.** `shared/src/**` must not import from `src/`,
   `server/`, or any LLM/Azure SDK.
6. **Server functions carry PRIVACY banners.** Every `server/src/functions/*.ts`
   must have a `PRIVACY` comment at the top. Never log payloads, tokens, or IP
   addresses beyond the safe error code.
7. **Don't write secrets to logs or commit them.** `.env.local` (client) and
   `server/local.settings.json` are git-ignored. Client needs only
   `NEXT_PUBLIC_WRAP_API_URL`. Server needs `WRAP_JWT_SECRET` plus
   `ANTHROPIC_API_KEY` and/or `AZURE_FOUNDRY_PROJECT_ENDPOINT`.

## Conventions

- **Type safety**: `tsc --noEmit` is the source of truth. Run `pnpm typecheck`
  before pushing.
- **Validation at boundaries**: API routes parse with Zod. Loading
  `models.config.json` is also Zod-validated at import time.
- **Comments**: only when the *why* is non-obvious. Never restate what the
  code does.
- **No new files unless necessary.** Prefer editing existing modules.
- **Slices fan out independently.** `generateWrap` uses `Promise.allSettled`
  so a single slice failure falls back via `fallbackForSlice` rather than
  failing the whole wrap.

## Adding or changing models

Edit `server/src/ai/models.config.json`. Schema:

```json
{
  "id": "azure:gpt-5.5-1",
  "label": "gpt-5.5-1 (Azure Foundry)",
  "provider": "azure-foundry",
  "modelId": "gpt-5.5-1",
  "version": "2024-12-01-preview",
  "parameters": { "temperature": 1.0 }
}
```

- `id` must be unique (enforced at import).
- `provider` is `'anthropic'`, `'azure-foundry'`, or `'ollama'`.
- For Azure, `modelId` is the **deployment name** in your Foundry project,
  and `version` is the api-version forwarded to Azure OpenAI.
- For Ollama, `modelId` is the tag passed to `ollama pull` (e.g.
  `llama3.1:8b`). Optional `baseUrl` overrides the default
  `http://localhost:11434` for a single entry; the env var
  `OLLAMA_BASE_URL` applies deployment-wide. No Ollama entry ships
  enabled by default — operators opt in.
- `parameters` is spread verbatim into the upstream chat-completions request
  (Anthropic / Azure) or into Ollama's `options` blob (Ollama).

Example Ollama entry (add to `models.config.json` after `ollama serve` is
running and `ollama pull llama3.1:8b` has completed):

```json
{
  "id": "ollama:llama3.1-8b",
  "label": "Llama 3.1 8B (Ollama, local)",
  "provider": "ollama",
  "modelId": "llama3.1:8b",
  "baseUrl": "http://localhost:11434",
  "parameters": { "temperature": 0.7, "num_ctx": 8192 }
}
```

### Adding a new provider

Dispatch lives in `server/src/ai/providers/`. Each adapter is a single file
implementing `ProviderAdapter = (systemPrompt, userMessage, model) =>
Promise<string>`. To add a new target:

1. Add the new provider id to the `provider` enum in `server/src/ai/models.ts`.
2. Create `server/src/ai/providers/<name>.ts` exporting a `ProviderAdapter`.
   Failures must collapse to `UpstreamError` codes from the allowlist in
   `server/src/privacy.ts`.
3. Register it in `server/src/ai/providers/index.ts` — the
   `Record<ModelProvider, ProviderAdapter>` type makes an unregistered
   provider a compile error.

The Azure path uses `@azure/ai-projects`' `getAzureOpenAIClient`, which
only handles Azure OpenAI–compatible deployments. Phi/Llama/Mistral need
`@azure-rest/ai-inference` (not yet wired — see `Tasks.md` for the parking
lot of small follow-ups, or `tasks/` for shaped specs that have a design).

## Testing patterns

- **MSW** mocks Anthropic at the network layer. Client mocks: `test/mocks/`.
  Server mocks: `server/test/mocks/`.
- **fake-indexeddb** + **happy-dom** stand in for the browser store.
- Live API runs are gated by `INTEGRATION_LIVE=1` so they never run in
  default CI.
- E2E asserts privacy invariants: locality (clear → empty), encryption at
  rest (raw IDB rows opaque), network minimality (no identifiers in payloads).
- **Two separate test suites**: `pnpm test` at the root covers the client;
  `cd server && pnpm test` covers the server Functions and AI layer.

## Pull-request checklist

- [ ] `pnpm typecheck` passes (client).
- [ ] `cd server && pnpm typecheck` passes (server).
- [ ] `pnpm lint` passes.
- [ ] `pnpm test` passes (client).
- [ ] `cd server && pnpm test` passes (server).
- [ ] PRIVACY banners intact in any new `server/src/functions/*.ts`.
- [ ] No `console.log` of payloads or tokens in client or server.
- [ ] If you added a model, `server/src/ai/models.config.json` validates.
- [ ] If you touched encryption, `test/unit/crypto.test.ts` still passes.

## Where to look first when something breaks

| Symptom                             | Start here                                        |
|-------------------------------------|---------------------------------------------------|
| Wrap enqueue 401/403                | `server/src/auth/jwt.ts` — check `WRAP_JWT_SECRET`; client-side token is in `src/lib/local-store/tokens.ts` |
| Wrap enqueue 404 / Functions unreachable | `NEXT_PUBLIC_WRAP_API_URL` in `.env.local`; confirm `func start` is running on :7071 |
| Wrap generation 404 from LLM       | `server/src/ai/client.ts` — Azure deployment name + api-version in `models.config.json` |
| Wrap generation 401/403 from LLM   | Azure CLI login (`az login`) for DefaultAzureCredential, or `ANTHROPIC_API_KEY` in `server/local.settings.json` |
| Wrap generation 503 "Ollama unreachable" | `ollama serve` running? `OLLAMA_BASE_URL` (or the per-model `baseUrl`) reachable? `ollama pull <model>` for the configured `modelId`? See `server/src/ai/providers/ollama.ts`. |
| Job stuck in `queued`               | Service Bus connection — check `AZURE_SERVICE_BUS_NAMESPACE` and `ServiceBusConnection__fullyQualifiedNamespace` |
| Slices fall back to placeholder     | Look at the slice's prompt in `server/src/ai/prompts/` and the JSON parse path in `server/src/ai/shared.ts` |
| Locked out of dashboard             | `src/components/unlock/UnlockGate.tsx` — passphrase or salt mismatch |
| IndexedDB rows missing after reload | Storage eviction; check `navigator.storage.persist()` call in unlock flow |
| CI fails on client privacy invariants | `test/unit/privacy-invariants.test.ts` — check `src/app/api/` absent, `src/lib/ai/` thin |
| CI fails on server privacy invariants | `server/test/unit/privacy-invariants.test.ts` — trace which function violated which rule |
