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

## 2026-05-15
- **Spec 51 — Reset (clear data) and de-register (forget passphrase)** (claude/implement-spec-51-hO60s). Shipped `DELETE /me/data` server endpoint that deletes all wrapJobs, wrapResults, and lookup rows for the calling install. Client orchestrator `local-store/reset.ts` handles two modes: "clear-data" (keeps passphrase + install token) and "forget-device" (drops everything and reloads). ResetModal component with RESET confirmation phrase, inline retry on mode A server failure, and "Proceed without server cleanup" secondary action for mode B offline case. "Forgot your passphrase?" link added to UnlockGate unlock branch. Share-bundle deletion (spec 31) code path is written but is a deliberate no-op until spec 31 lands.

## 2026-05-11
- **Spec 14 — Server build + deploy artifact** (claude/implement-spec-14-xmQBd). Added `pnpm -C server build` (tsc to `dist/` + copy-assets) and `pnpm -C server package` (build + `npm install --omit=dev` + zip to `wrap-server.zip`). `tsconfig.build.json` overrides the dev config to emit CommonJS for direct Node.js execution. One deviation: the spec assumed all `@wrapped/shared` imports were type-only, but two server functions import Zod schemas as values; `copy-assets.mjs` compiles shared into `dist/_shared/` and references it from the runtime `package.json`. CI gains server typecheck and server build steps. Deploy runbook added at `tasks/runbooks/server-deploy.md`.

## 2026-05-10
- **Spec 01 — Polling-success data loss when idle-locked**. Started implementation: pause polling when idle-locked, dispatch store-unlocked event on unlock. Added `paused-locked` phase to `PendingPollState`; `tick()` checks `hasActiveKey()` before fetching and waits for the `store-unlocked` CustomEvent when the key is absent. `UnlockGate` now dispatches the event after both setup and unlock flows. `PendingWrapView` renders "unlock to continue" copy for the paused-locked phase. Unit tests cover: locked→no-fetch, unlock-resumes, failing-saveWrap-no-delete, and multi-advance locked invariant.
- **Spec 20 — JWT secret rotation (`kid` + key map)** (claude/spec-20-9mk1y). Added `loadKeys()` to enumerate `WRAP_JWT_KEY_<kid>` env vars and select the active signer via `WRAP_JWT_ACTIVE_KID`. `signInstallToken` now stamps `kid` into the JWT protected header; `verifyInstallToken` uses a `jose` key-resolver to look up the kid on each incoming token, rejecting tokens with missing or unregistered kids. Backwards-compat shim for `WRAP_JWT_SECRET` (treated as `kid=legacy`) is included for one-release migration. Rotation runbook added to `tasks/runbooks/jwt-rotation.md`.

_No completed specs yet._
