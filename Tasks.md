# Tasks

Open work, parked here until shifted into Todoist.

## P0 — Unblockers

### Anthropic backing service deployment
- [ ] Deploy the Anthropic-direct backing service so `provider: 'anthropic'`
      entries in `models.config.json` actually resolve. The codepath is wired
      (`callAnthropic` in `src/lib/ai/client.ts:31`) but no infra is live.
- [ ] Verify `ANTHROPIC_API_KEY` is wired in the deployed environment.
- [ ] End-to-end smoke from the dashboard against the deployed Anthropic
      route once it's up.

### Azure Foundry deployment names
- [ ] Confirm the deployment names in
      `src/lib/ai/models.config.json` (`claude-haiku-4-5`, `gpt-5.5-1`)
      match what's actually deployed in the Foundry project. They were
      placeholder-ish guesses; if a deployment is renamed, the model
      stops working with a 404.
- [ ] Document the exact api-version each deployment supports (data-plane
      inference) and pin `version` per entry to avoid api-version drift.

## P1 — Model selection follow-ups

### Surface model selection in tests
- [ ] Add a unit test for `resolveModel(undefined | unknown | known)` in
      `src/lib/ai/models.ts`.
- [ ] Add a unit test that posting `modelId: 'azure:gpt-5.5-1'` to
      `/api/wrap` triggers the Azure path (mock both providers in
      `test/mocks/`).
- [ ] Update `test/unit/client.test.ts` to also exercise `callModel` (it
      currently imports the deprecated `callClaude` alias).

### Non-OpenAI Foundry models
- [ ] Add a second Azure path that uses `@azure-rest/ai-inference` so
      Phi/Llama/Mistral deployments can be exposed. Today
      `getAzureOpenAIClient` only routes to AOAI deployments, so a Phi
      entry in `models.config.json` would 404.
- [ ] Decide a marker on `ModelOption` (e.g. `provider: 'azure-foundry-mi'`
      or a flag) to choose between AOAI and Model Inference paths.

### UX polish on the model picker
- [ ] Persist the last-used `modelId` in `meta` so reopening the modal
      remembers the choice.
- [ ] Show a per-model badge ("OpenAI", "Anthropic", "Azure-routed") in
      the dropdown so the user understands the network path.
- [ ] Surface a clear error state in the modal when the chosen provider's
      env vars are missing (currently the API throws and the modal shows
      raw text).

## P1 — Privacy and safety

### Tighten the privacy invariants
- [ ] Add an invariant that `console.*` is never called with a variable
      named `payload`, `userMessage`, `request.body`, `freeText`, etc., in
      `src/lib/ai/**` and `src/app/api/**` (regex-based static check).
- [ ] Add an invariant that the `/api/wrap` route's request schema does
      not accept `userId`, `id`, or `externalId` keys (already enforced
      by the Zod schema; lock in with a test).
- [ ] CSP header pass on the Next.js responses (no inline scripts beyond
      what Next emits).

### Storage durability
- [ ] Wire `navigator.storage.persist()` into the unlock success path
      (referenced in README, not actually called in `UnlockGate.tsx`).
- [ ] Surface a warning banner if `navigator.storage.persisted()` returns
      false on Safari (informs the user about the 7-day eviction risk).

## P2 — Tauri shell

- [ ] Scaffold the Rust crate in `src-tauri/` (`cargo init`, `Cargo.toml`,
      `tauri.conf.json` per the README). Currently only the README and
      a `tauri.conf.json` exist.
- [ ] Replace in-memory `cachedKey` with `tauri-plugin-stronghold` (or
      Keychain-bound storage) when running under Tauri. Keep the browser
      path for `pnpm dev`.
- [ ] Verify `pnpm tauri:dev` and `pnpm tauri:build` both produce a
      runnable `.app` / `.dmg` after the scaffold lands.
- [ ] Decide where the proxy runs in production (the .app has no Node
      server). Document the deployment in README + ARCHITECTURE.

## P2 — Generation quality

- [ ] Add few-shot examples to the slice prompts that consistently fall
      back to the placeholder (`identity`, `highlight_reel`).
- [ ] Cap `formatContributionList` at ~30 entries for very wide windows
      to avoid token blowups in `year-end` mode.
- [ ] Surface per-slice timing in the API response (already logged
      server-side) so the UI can show progress instead of a single spinner.
- [ ] Decide whether to keep the JSON-only response contract or switch
      to tool-use / structured outputs for stricter parsing.

## P2 — Testing and CI

- [ ] Cover `models.config.json` with a Zod-schema test (e.g. assert that
      every entry has a unique `id` and a valid provider).
- [ ] Add a Playwright spec that exercises the model picker end-to-end
      (snapshot the request body in `network-minimality.spec.ts`).
- [ ] Wire a `workflow_dispatch` job that runs `pnpm ai:test:live` against
      the deployed proxy on demand.
- [ ] Cache the Playwright browser install in CI to shave ~30 s off each
      e2e run.

## P3 — Cleanup

- [ ] Delete the `callClaude` deprecated alias in `client.ts` once
      `classify.ts` and `test/unit/client.test.ts` are migrated to
      `callModel`.
- [ ] Move the tab-hide / beforeunload listeners in
      `src/lib/local-store/crypto.ts` out of module scope and into an
      explicit `installLockHandlers()` so the module is side-effect free
      under SSR/test.
- [ ] Audit the `extraInstructions` strings in `src/lib/ai/prompts/*` for
      consistency — some end with periods, some don't.
- [ ] Replace the hand-rolled retry loop in `client.ts` with a small
      `withRetry(fn, { delays })` helper used by both providers.

## Nice to have

- [ ] Allow users to upload their own `models.config.json` at runtime
      (file picker → validated → cached in `meta`). Useful for orgs that
      want to point at private Foundry projects without rebuilding.
- [ ] Export-as-PNG for individual slides (the share story).
- [ ] Per-slice "regenerate" button in the wrap viewer.
- [ ] Slack / GitHub / Jira live ingest (currently only `manual` source
      via `ManualInputForm`; the other sources only appear in demo data).
