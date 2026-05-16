# Spec changelog

Chronological log of completed specs, newest-first. This is the
cross-spec view; each entry corresponds to a `## Done` block on the
spec file itself.

When you ship a spec, add an entry here in the **same PR** that flips
`Status: Done` on the spec file. See `tasks/README.md` ("How an agent
should use this directory") and the root `CLAUDE.md` for the workflow.

## Format

```
## YYYY-MM-DD
- **Spec NN — Title** (#PR). One-paragraph summary: what shipped, any
  deviation from the Solution shape, follow-ups raised.
```

Group entries by date, newest date at the top. Multiple specs that ship
on the same day share one date heading.

---

## 2026-05-16
- **Spec 60 — Ollama local provider** (claude/ollama-llm-adapters-8DpaB). Added `provider: 'ollama'` to the model catalog, optional `baseUrl` on every entry, and a `callOllama` adapter that POSTs to `${baseUrl}/api/chat` with `stream: false`, the `parameters` blob forwarded into Ollama's `options`, and the existing `RETRY_DELAYS` schedule. New `ollama_unreachable` UpstreamError code (with `baseUrl` hint) joins the allowlist; `not_found` from Ollama carries an `ollama pull <modelId>` hint. **Deviation from the Solution shape**: instead of adding `callOllama` directly inside `client.ts`, the three providers were extracted into `server/src/ai/providers/{anthropic,azureFoundry,ollama}.ts` with a `Record<ModelProvider, ProviderAdapter>` registry in `providers/index.ts`. `client.ts` is now a 6-line dispatcher. This was an explicit user ask alongside picking up the spec — adding a fourth provider is now three edits (enum value, adapter file, registry row) enforced by the exhaustive `Record` type. No behavior changes for Anthropic / Azure Foundry; `callClaude` shim still works for `classify.ts`. Privacy invariants extended: an automated check confirms `baseUrl` only appears inside the `ollama_unreachable` UpstreamError constructor. No Ollama entry ships enabled in `models.config.json`; operators opt in.

## 2026-05-11
- **Spec 14 — Server build + deploy artifact** (claude/implement-spec-14-xmQBd). Added `pnpm -C server build` (tsc to `dist/` + copy-assets) and `pnpm -C server package` (build + `npm install --omit=dev` + zip to `wrap-server.zip`). `tsconfig.build.json` overrides the dev config to emit CommonJS for direct Node.js execution. One deviation: the spec assumed all `@wrapped/shared` imports were type-only, but two server functions import Zod schemas as values; `copy-assets.mjs` compiles shared into `dist/_shared/` and references it from the runtime `package.json`. CI gains server typecheck and server build steps. Deploy runbook added at `tasks/runbooks/server-deploy.md`.

## 2026-05-10
- **Spec 01 — Polling-success data loss when idle-locked**. Started implementation: pause polling when idle-locked, dispatch store-unlocked event on unlock. Added `paused-locked` phase to `PendingPollState`; `tick()` checks `hasActiveKey()` before fetching and waits for the `store-unlocked` CustomEvent when the key is absent. `UnlockGate` now dispatches the event after both setup and unlock flows. `PendingWrapView` renders "unlock to continue" copy for the paused-locked phase. Unit tests cover: locked→no-fetch, unlock-resumes, failing-saveWrap-no-delete, and multi-advance locked invariant.
- **Spec 20 — JWT secret rotation (`kid` + key map)** (claude/spec-20-9mk1y). Added `loadKeys()` to enumerate `WRAP_JWT_KEY_<kid>` env vars and select the active signer via `WRAP_JWT_ACTIVE_KID`. `signInstallToken` now stamps `kid` into the JWT protected header; `verifyInstallToken` uses a `jose` key-resolver to look up the kid on each incoming token, rejecting tokens with missing or unregistered kids. Backwards-compat shim for `WRAP_JWT_SECRET` (treated as `kid=legacy`) is included for one-release migration. Rotation runbook added to `tasks/runbooks/jwt-rotation.md`.

_No completed specs yet._
