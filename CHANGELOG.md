# Changelog

All notable changes to Wrapped for Work are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

### Added

#### HTML user guide and 5-minute pitch page (PR #74)

Two static pages added to `public/` for the private preview:

- `public/user-guide.html` — full seven-section reference guide covering
  onboarding, the dashboard, adding contributions (manual entry, file import,
  provider sync), wrap generation, all 10 slide types, settings, and the
  privacy model. Written in the Burrito brand voice with the app's full design
  language (Space Grotesk, Syne, JetBrains Mono, DM Sans; Tomato palette tokens;
  ink borders with drop shadows).

- `public/pitch.html` — a concise one-pager for new users: what the product is,
  the gap it fills, how it works in three steps, the 10 slide chips, and the
  privacy model split into what stays on device vs. what reaches the AI proxy.
  The two pages link to each other.

Both pages use `./logo.png` (relative path) and are served statically by
Next.js from the `public/` directory.
#### App logo (PR #73)

The app now has a logo asset wired into the UI.

#### Tauri 2 macOS shell bootstrap — `src-tauri/` Rust crate (Spec 40, PR #71)

The Rust crate for the Tauri 2 native macOS distribution target is now present
and buildable. Key design decisions:

- **No invoke handlers in v1.** Crypto, storage, and AI remain in JavaScript and
  load from the same Next.js static export the browser build produces. The Tauri
  shell is a thin WebView wrapper only.
- **`scripts/tauri-csp.mjs`** replaces the stale `scripts/tauri-export.mjs`
  (which referenced `src/app/api/`, a directory removed when the backend moved to
  `server/`). The new script templates `tauri.conf.json` from
  `tauri.conf.template.json`, substituting the Functions origin from
  `NEXT_PUBLIC_WRAP_API_URL` (defaults to `http://localhost:7071`; wildcards
  rejected). The CSP `connect-src` now names the configured Functions host
  instead of the old `https://api.anthropic.com`.
- **`pnpm tauri:check`** runs `cargo check` without opening a window; CI gains a
  paths-filter-gated job so the crate can't silently break.
- **Tauri invariant tests** added in `test/unit/tauri-invariants.test.ts`: no
  static `@tauri-apps/api/*` imports under `src/`, `endpoint.ts` keeps throwing
  when `NEXT_PUBLIC_WRAP_API_URL` is unset (no implicit Tauri fallback), and the
  `TAURI=1` → `output: 'export'` mapping in `next.config.mjs` is preserved.

#### Private-preview invite-code gate and per-session data isolation (PR #69)

Wrapped for Work now supports a private-preview mode gated by invite codes:

- **Backend gate**: `POST /auth/register` validates the supplied code against the
  `INVITE_CODES` env var (comma-separated list). Unknown codes receive a 403.
  When `INVITE_CODES` is unset the endpoint remains open, so existing
  deployments are unaffected.
- **Invite gate UI**: `UnlockGate` shows an invite-code form on first launch.
  The code is validated against the backend before the passphrase setup/unlock
  screen appears.
- **Per-session IndexedDB isolation**: each invite code gets its own IndexedDB
  database (`wrapped-for-work-{code-slug}`). Users on the same device sharing
  codes never see each other's contributions, wraps, or identities.
- **Leave preview**: both the dashboard settings tab and `/dashboard/settings`
  have a "Leave preview" button that clears the session and returns to the
  invite-code gate.

The backend gate is covered by 14 new unit tests in
`server/test/unit/authRegister.test.ts`.

#### Desktop variant layout for SlideFrame — landscape 1440×760 (PR #49)

`SlideFrame` now accepts a `variant` prop (`'phone' | 'desktop'`). The desktop
variant renders slides at 1440×760 in a two-column landscape layout: stat on the
left, headline/body/supporting copy on the right, with typography scaled up
significantly (headline 64 px, stat up to 200 px). `WrapDesktop` was updated to
use the new desktop layout and recalculates `SLIDE_SCALE` to fit within the
available canvas. All 10 slice components were updated to accept and forward the
`variant` prop.

#### OpenAPI 3.1 spec for the server API at `docs/openapi.yaml`

Every HTTP endpoint the server exposes — `POST /auth/register`,
`POST /classify`, `POST /wrap`, `GET /wrap/{jobId}`, `POST /import`, and
`DELETE /me/data` — is now described in a single OpenAPI 3.1 YAML file at
`docs/openapi.yaml`. Request and response schemas mirror the Zod schemas in
`shared/src/schemas.ts` (treat that file as the source of truth — if you
change one, change the other).

The spec captures the auth model (per-install JWT via `Authorization:
Bearer <token>`, anonymous for `/auth/register`), the rate-limit envelope
(`{error, resetAt}`), the multipart contract for `/import` including the
256 KB cap and supported MIME types, and the polymorphic `GetWrapResponse`
discriminated on `status`. The Service Bus–triggered `wrapWorker` function
is intentionally absent — it's not an HTTP endpoint.

Two `servers:` entries are pre-filled: `http://localhost:7071/api` for local
`func start`, and a templated `{functionAppHost}` entry for deployed
environments.

#### Azure Foundry Anthropic provider — Claude deployments on Azure (PR #66)

Claude models served from an Azure AI Foundry resource are now a first-class
provider. Add an entry to `server/src/ai/models.config.json` with `provider:
"azure-foundry-anthropic"` and the deployment name as `modelId`.

**Why a separate provider**

A Foundry resource fronts two incompatible API surfaces. Azure OpenAI–compatible
deployments (GPT) answer `/chat/completions`; Claude deployments only answer the
Anthropic Messages API and 404 on `/chat/completions`. The existing
`'azure-foundry'` adapter — which goes through `@azure/ai-projects`'
`getAzureOpenAIClient` — therefore cannot reach Claude on Foundry. The new
`'azure-foundry-anthropic'` adapter (`server/src/ai/providers/azureFoundryAnthropic.ts`)
targets the Anthropic Messages endpoint directly.

**Configuration**

The adapter reads the resource-level Anthropic base URL from
`AZURE_FOUNDRY_ANTHROPIC_ENDPOINT` (or a per-entry `baseUrl`) and ignores the
`version` field used by Azure OpenAI. Auth uses `DefaultAzureCredential` — the
same path as the existing Azure Foundry adapter — so local dev still works via
`az login` and production runs via managed identity.

**Breaking change to `models.config.json`**

The default model catalog has been renamed and pruned:

| Old `id`                        | New `id`                                       | Notes |
|---------------------------------|------------------------------------------------|-------|
| `azure:claude-haiku-4-5`        | `azure-foundry-anthropic::claude-haiku-4-5`    | Provider switched from `azure-foundry` to `azure-foundry-anthropic`; `version` field removed |
| `azure:gpt-5.5-1`               | `azure-foundry:gpt-5.5-1`                      | Renamed only — provider and behavior unchanged |
| `anthropic:claude-sonnet-4`     | _(removed)_                                    | Standalone Anthropic Sonnet entry dropped from the default config; operators who want it must re-add it locally |

Persisted wraps and queued jobs reference these ids, so any in-flight job
enqueued against the old `azure:claude-haiku-4-5` id will fail validation on
pickup. Drain the queue before deploying, or restore the old id alongside the
new one for one release.

#### Ollama local provider — generate wraps against a model on your machine (Spec 60)

`provider: 'ollama'` is now a valid entry type in `server/src/ai/models.config.json`.
The adapter POSTs to `${baseUrl}/api/chat` with `stream: false`, forwards the
`parameters` blob into Ollama's `options`, and shares the same retry schedule as
the other providers. `baseUrl` is optional per-entry and defaults to
`http://localhost:11434`; the env var `OLLAMA_BASE_URL` sets a deployment-wide
default.

A new `ollama_unreachable` upstream error code surfaces when Ollama isn't
running; an `ollama pull <modelId>` hint accompanies `not_found` responses so
operators know exactly what to pull. **No Ollama entry ships enabled in the
default `models.config.json`** — operators opt in by adding a model entry and
running `ollama pull` for its `modelId`.

Adding a fourth provider going forward is three edits: a value in the
`ModelProvider` enum (`server/src/ai/models.ts`), an adapter file in
`server/src/ai/providers/`, and a row in the `Record<ModelProvider,
ProviderAdapter>` registry. The exhaustive `Record` type turns a forgotten
registry entry into a compile error.

#### Reset and "Forget device" — clear your data or your passphrase (Spec 51)

Two new flows are reachable from the unlock gate and the dashboard:

- **Reset (clear data)** — calls `DELETE /me/data` on the server, which removes
  all `wrapJobs`, `wrapResults`, and lookup rows for the calling install, then
  clears IndexedDB on the device. Passphrase and install token are kept, so you
  can immediately start over without re-registering.
- **Forget device** — drops everything locally (encrypted store, install token,
  passphrase) and reloads. A "Forgot your passphrase?" link on the unlock
  screen is the entry point.

Both actions require typing **RESET** as a confirmation phrase. Mode A
(clear data) shows inline retry copy if the server delete fails; Mode B (forget
device) offers a "Proceed without server cleanup" secondary action for the
offline case.

#### Server build & deploy artifact pipeline (Spec 14)

The `server/` package now has a real build step:

- `pnpm -C server build` runs `tsc` to `dist/` and copies host assets.
- `pnpm -C server package` produces `wrap-server.zip` (build → `npm install
  --omit=dev` → zip) — the artifact you upload to Azure Functions.

`tsconfig.build.json` emits CommonJS for direct Node execution. `@wrapped/shared`
is compiled into `dist/_shared/` because two server functions import Zod schemas
as runtime values, not types-only. CI gains server typecheck and server build
steps. The deploy steps live in `tasks/runbooks/server-deploy.md`.

#### JWT secret rotation — `kid` header and key map (Spec 20)

`WRAP_JWT_SECRET` is no longer the only way to configure JWT signing.
`loadKeys()` enumerates `WRAP_JWT_KEY_<kid>` env vars at startup; the active
signer is chosen by `WRAP_JWT_ACTIVE_KID`. `signInstallToken` stamps `kid` into
each token's protected header, and `verifyInstallToken` resolves the key from
that `kid` on each request. Unknown or missing `kid` values are rejected.

A backwards-compatibility shim keeps `WRAP_JWT_SECRET` working as `kid=legacy`
for one release. The rotation runbook lives at `tasks/runbooks/jwt-rotation.md`.

#### File upload — import contributions from a document (Spec 50)

You can now import contribution data directly from a local file rather than
connecting a live account. The feature is accessible from the dashboard via
**Import from file**.

**How it works**

A two-step modal collects a batch label (step 1) and a file + model selection
(step 2). The file is sent in a single multipart request to `POST /import` on
the server, processed in memory by the chosen LLM, and the extracted
contributions are returned as structured rows — nothing is written to a queue,
table, blob store, or disk on the server. The function scope is the only
lifetime the file content has on the server side.

**Supported file types**

| Extension | Handling |
|-----------|----------|
| `.txt`    | Decoded as strict UTF-8; invalid bytes return 415 |
| `.md`     | Same as `.txt` |
| `.docx`   | Plain text extracted via `mammoth` (formatting stripped) |

Files larger than **256 KB** are rejected before extraction (413). Extracted
text is also capped at 256 KB post-extraction — a small `.docx` can decompress
to more text than its raw byte size, so both limits are enforced.

PDF, CSV, JSON, XLSX, and other formats are not currently supported.

**Identity and deduplication**

The label typed in step 1 doubles as a stable identity key. It is slugified
(`"Q1 Work Laptop"` → `"q1-work-laptop"`) and stored as the identity's
`externalUserId` in IndexedDB. Re-uploading under the same label appends to
the same identity rather than creating a duplicate.

Contributions are deduplicated by `externalId` within that identity. If the
LLM returns an `externalId` (e.g. a commit SHA found in the file), that value
is used. Otherwise a deterministic fallback is derived from `signal +
occurredAt`, so re-uploading the same file a second time produces no duplicate
rows. This deduplication runs entirely in the browser against IndexedDB —
the server never sees or stores `externalId` values.

**Privacy posture**

The file-upload path is the only place in the app where file content briefly
leaves the device. The egress is bounded:

- The file is sent to the **chosen model provider only** (Anthropic, Azure
  Foundry, or Ollama). The UI disclosure in step 2 names the provider before
  the user uploads.
- The server function holds no persistence imports. CI enforces this:
  `server/test/unit/privacy-invariants.test.ts` asserts `import.ts` does not
  import from the queue, table storage, blob, or `node:fs` modules, and does
  not log file content or model responses.
- After the function returns, the file bytes and the model's raw output go out
  of scope. No replay cache, no audit log of content.

**After extraction — review step**

Extracted rows pass through a review step before being persisted. Rows where
the LLM could not determine a date are flagged as `autoDated: true` and
highlighted so you can correct them before they are saved.

### Fixed

#### ManualInputForm wired to `classify()`, wrap players forwarded real slices (PR #30)

Two wiring bugs that caused incorrect behaviour in all environments:

- `ManualInputForm` was calling `fetch('/api/classify', ...)` — a relative URL
  that 404s in any deployment. The call is now routed through `classify()` from
  `src/lib/ai/classify.ts`, which uses the configured backend URL with auth
  headers and falls back gracefully on error.
- `WrapExperience` was rendering `WrapDesktop` / `WrapPhone` without forwarding
  `slices`, `mode`, or `title`, so every generated wrap showed hardcoded mock
  data. The players now receive real props and use the `src/components/slides/`
  components as the single rendering path for both mobile and desktop views.

Component tests added: 7 cases for `ManualInputForm` and 4 for `WrapViewer`.

#### Polling no longer drops a wrap when the store is idle-locked (Spec 01)

Previously, if the IndexedDB store auto-locked while a wrap was generating,
the poller could see a "succeeded" response from `GET /wrap/{jobId}` and then
fail to save the result locally — losing the wrap. The pending entry would
then be deleted as if it had succeeded, with nothing on the device.

The poller now pauses while the store is locked: `tick()` checks
`hasActiveKey()` before fetching and waits for a `store-unlocked` `CustomEvent`
when the key is absent. A new `paused-locked` phase on `PendingPollState`
surfaces an "unlock to continue" message in `PendingWrapView`. `UnlockGate`
dispatches `store-unlocked` after both first-time setup and unlock flows, so
the poller resumes the moment the key is back in memory.

### Changed

#### Pending wrap viewer restyled to match editorial theme (PR #57)

The loading and pending states of the wrap viewer used a dark theme (near-black
background, white text, soft borders) that clashed with the rest of the site's
maximalist editorial style. They now use the same cream-paper background, 2 px
ink borders, hard offset shadows, and Space Grotesk / JetBrains Mono typography
as the rest of the UI.

#### C4 architecture diagram moved into `docs/`

`burrito-c4.html` now lives at `docs/burrito-c4.html`, alongside its source
prompt (`docs/burrito-c4-diagram.prompt.md`) and the new `docs/openapi.yaml`.
The prompt was updated so future regenerations write to the new path. No
behavioral change — this is purely a docs reorganisation.

#### C4 architecture diagram — Contribution Sources, LLM Providers, Import Handler (PR #68)

`docs/burrito-c4.html` (and its source prompt at `docs/burrito-c4-diagram.prompt.md`)
now reflects the full current architecture:

- A new **Contribution Sources [External]** boundary on the left shows the pull
  providers (GitHub / GitLab / Jira) that flow through the `ContributionProvider`
  adapter pattern.
- A new **LLM Providers [External]** boundary on the right replaces the single
  "OLLAMA" box with three stacked external systems: **Anthropic API**, **Azure
  AI Foundry**, and **Ollama** (opt-in local runtime). The `callModel()` arrow
  arcs from Wrapper Generator out to this boundary.
- The client gains a fifth component, **File Import Panel**, representing the
  Spec 50 two-step modal.
- Backend Services gains an **Import Handler** (POST `/import`, no persistence,
  256 KB cap) — the Auth route table now lists `/import`.
- The Service Bus trigger arrow (Queue → Wrapper Generator) and the enqueue
  arrow origin (now correctly Wrapper Generator → Queue rather than Auth →
  Queue) were corrected to match the code.
- The decommissioned UAT Agent component was removed.

Canvas grew to 1440×870 to accommodate the left column; external boundaries use
a gray color scheme to distinguish them from the blue Azure system boundary.
This is a documentation-only change — no runtime behavior was affected.
