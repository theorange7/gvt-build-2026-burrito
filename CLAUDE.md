# CLAUDE.md

Guide for Claude Code (and other agents) working in this repo.
Keep it short — the README and ARCHITECTURE.md carry the prose.

## What this app is

**Wrapped for Work** — a local-first Next.js app that turns engineering
contribution data into a Spotify-Wrapped-style year-end recap.

- Frontend: Next.js 15 (App Router) + React 19 + Tailwind + Framer Motion.
- Local store: Dexie (IndexedDB) with envelope-encrypted records (AES-GCM-256
  + PBKDF2-SHA-256, 600k iterations).
- AI: stateless Next.js API routes (`/api/wrap`, `/api/classify`) that proxy
  to a chosen LLM. Provider is selectable per request — Anthropic direct
  (`callAnthropic`) or Azure AI Foundry via `@azure/ai-projects`
  (`callAzureFoundry`).
- Shipping target v2: Tauri 2 macOS shell (`src-tauri/`).

## Commands

```bash
pnpm install
pnpm dev               # NODE_ENV=development next dev
pnpm build             # next build
pnpm typecheck         # tsc --noEmit  (run before committing)
pnpm lint              # next lint
pnpm test              # vitest run (unit + integration with MSW mocks)
pnpm test:watch
pnpm test:e2e          # playwright (boots dev server)
pnpm ai:test           # integration smoke against mocked Anthropic
pnpm ai:test:live      # same suite against real Anthropic (needs key)
pnpm export:demo       # regenerate public/demo-contributions.json
pnpm tauri:dev         # native shell dev, requires Rust
pnpm tauri:build       # ships .dmg
```

## Repo layout

```
src/
  app/
    api/
      classify/route.ts     POST /api/classify  — single-signal classifier
      wrap/route.ts         POST /api/wrap      — full 10-slice generation
    dashboard/page.tsx      Gated entry point
    wrap/[id]/page.tsx      Renders a saved wrap
    layout.tsx, page.tsx, providers.tsx
  components/
    dashboard/              Shell, manual-input form, contribution feed,
                            generate-wrap modal (model picker lives here)
    slides/                 One component per slice + SlideFrame
    unlock/UnlockGate.tsx   Passphrase gate (setup + unlock)
    wrap/                   WrapExperience, WrapViewer
  lib/
    ai/
      client.ts             callModel — provider dispatch + retry
      models.ts             Loads + Zod-validates models.config.json
      models.config.json    EDIT THIS to add/remove/retune models
      classify.ts           Single-signal classification via callClaude alias
      generate.ts           Fan-out across 10 slice generators
      shared.ts             createSlice helper used by every prompt
      prompts/              One file per slice; builds the user message
    local-store/
      crypto.ts             AES-GCM/PBKDF2 + in-memory key + idle lock
      db.ts                 Dexie schema + envelope row types
      contributions.ts      add/list/range queries (encrypts on write)
      wraps.ts              save/get wraps (encrypts sliceContent)
      seed.ts               First-run demo seeding from public JSON
      hooks.ts, platform.ts, index.ts
    types.ts                Domain types
src-tauri/                  Tauri 2 shell (macOS)
tasks/                      Shaped task specs (see "Shaped task specs" below)
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
5. **Discoveries that don't fit the current spec** go under the spec's
   `Notes` section as bullets, not into the implementation.

`tasks/` is for shaped work; `Tasks.md` (root, separate file) is the
informal todo parking lot. Promote a `Tasks.md` bullet to a spec only after
a real design conversation.

## Hard rules

These are encoded as static-analysis tests in
`test/unit/privacy-invariants.test.ts`. Breaking them fails CI.

1. **No persistence on the server.** API routes (`src/app/api/**`) must not
   import `@prisma/client`, `@/lib/db`, or `@/lib/local-store/*`, must not
   touch `node:fs`, and must carry a `PRIVACY` banner comment.
2. **No request-body logging.** `client.ts`/`classify.ts`/`shared.ts` log
   only error status codes and short messages. Never `console.log(payload)`,
   never `console.log(userMessage)`.
3. **No leaking identifiers.** The `/api/wrap` payload omits `userId`,
   `id`, and `externalId` (see `GenerateWrapModal.generate`). The e2e suite
   asserts this.
4. **Local-store imports stay browser-side.** `src/lib/ai/**` and
   `src/app/api/**` must not import anything under `src/lib/local-store/`.
5. **Don't write secrets to logs or commit them.** `.env.local` is git-ignored.
   Required env: `ANTHROPIC_API_KEY` (Anthropic provider) and/or
   `AZURE_FOUNDRY_PROJECT_ENDPOINT` + Azure CLI/Entra credentials picked up
   by `DefaultAzureCredential`.

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

Edit `src/lib/ai/models.config.json`. Schema:

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
- `provider` is `'anthropic'` or `'azure-foundry'`.
- For Azure, `modelId` is the **deployment name** in your Foundry project,
  and `version` is the api-version forwarded to Azure OpenAI.
- `parameters` is spread verbatim into the upstream chat-completions request.

The Azure path uses `@azure/ai-projects`' `getAzureOpenAIClient`, which
only handles Azure OpenAI–compatible deployments. Phi/Llama/Mistral need
`@azure-rest/ai-inference` (not yet wired — see `Tasks.md` for the parking
lot of small follow-ups, or `tasks/` for shaped specs that have a design).

## Testing patterns

- **MSW** mocks Anthropic at the network layer. See `test/mocks/`.
- **fake-indexeddb** + **happy-dom** stand in for the browser store.
- Live API runs are gated by `INTEGRATION_LIVE=1` so they never run in
  default CI.
- E2E asserts privacy invariants: locality (clear → empty), encryption at
  rest (raw IDB rows opaque), network minimality (no identifiers in payloads).

## Pull-request checklist

- [ ] `pnpm typecheck` passes.
- [ ] `pnpm lint` passes.
- [ ] `pnpm test` passes.
- [ ] Privacy banners intact in any new API route.
- [ ] No `console.log` of payloads.
- [ ] If you added a model, `models.config.json` validates.
- [ ] If you touched encryption, `test/unit/crypto.test.ts` still passes.

## Where to look first when something breaks

| Symptom                             | Start here                                        |
|-------------------------------------|---------------------------------------------------|
| Wrap generation 404                 | `src/lib/ai/client.ts` (Azure deployment name + api-version) |
| Wrap generation 401/403             | Azure CLI login (`az login`) for DefaultAzureCredential, or `ANTHROPIC_API_KEY` |
| Slices fall back to placeholder     | Look at the slice's prompt in `src/lib/ai/prompts/` and the JSON parse path in `shared.ts:createSlice` |
| Locked out of dashboard             | `src/components/unlock/UnlockGate.tsx` — passphrase or salt mismatch |
| IndexedDB rows missing after reload | Storage eviction; check `navigator.storage.persist()` call in unlock flow |
| CI fails on privacy invariants      | `test/unit/privacy-invariants.test.ts` — trace which file violated which rule |
