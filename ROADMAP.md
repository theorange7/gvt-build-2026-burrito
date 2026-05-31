# Roadmap

## Completed
Recently shipped features

### Invite-code gate and per-session data isolation
Private-preview mode gated by invite codes. Each code gets its own isolated IndexedDB database so users on the same device never share contributions, wraps, or identities.

### Tauri 2 macOS shell bootstrap
Native macOS distribution target. A thin WebView wrapper around the Next.js static export — crypto, storage, and AI stay in JavaScript.

### File-upload contribution provider
Import contribution data from `.txt`, `.md`, or `.docx` files. Extracted rows go through a review step before being persisted; the file never touches the server's disk or queue.

### Azure Foundry Anthropic provider
Claude models served from an Azure AI Foundry resource are now a first-class provider alongside GPT deployments, Anthropic direct, and Ollama.

### Ollama local provider
Generate wraps against a model running on your machine. Operators opt in by adding a model entry to `models.config.json` and running `ollama pull` for its `modelId`.

### Reset and "Forget device"
Two escape hatches reachable from the unlock gate and the dashboard: clear all server and local data while keeping your passphrase, or wipe everything locally for when you've lost your passphrase.

### JWT secret rotation
`WRAP_JWT_SECRET` is no longer the only signing key. Multiple keys can coexist via `WRAP_JWT_KEY_<kid>` env vars; the active signer is chosen by `WRAP_JWT_ACTIVE_KID` for zero-downtime rotation.

### Server build and deploy artifact
`pnpm -C server package` produces a `wrap-server.zip` ready to upload to Azure Functions. CI gates server typecheck and build on every push.

### Desktop slide layout
`SlideFrame` renders at 1440×760 in a two-column landscape layout for desktop views, with typography scaled significantly from the phone variant.

### OpenAPI 3.1 spec
Every HTTP endpoint — `/auth/register`, `/classify`, `/wrap`, `/wrap/{jobId}`, `/import`, and `/me/data` — is documented in `docs/openapi.yaml`.

---

## Active
What we're working on now

### Wrap polling continuity
The poller pauses when the IndexedDB store auto-locks and resumes the moment the passphrase is re-entered, so a wrap in flight is never lost to an idle lock.

### UI and functionality overhaul
Full design handoff from the Claude Design brief — revised visual language, file upload as a primary recap entry point, and consolidated navigation. Largest single surface change to date.

---

## Planned
What we intend to do

### Stuck job recovery
Detect and recover wrap jobs that get stuck in `running` — a TTL sweeper reaps stale lookup and result rows so the dashboard never shows a job that will never finish.

### Pause polling when hidden or offline
Stop hitting the server while the tab is backgrounded or the device is offline. Distinguish transient network errors from terminal job failures so the UI surfaces the right message.

### Encrypt pending wrap requests
`pendingWrapRequests` in IndexedDB is currently stored in the clear. Extend envelope encryption to cover it, consistent with the rest of the local store.

### Graceful "wrap not on this device"
When a wrap job was completed on a different device, show a clear explanation rather than a silent failure or a stale loading state.

### Automated UAT suite (Playwright)
End-to-end flows covering the golden path — invite gate, contribution import, wrap generation, and slide review — running in CI against a local Functions host.

### Backend metrics and observability
App Insights integration for wrap generation latency, slice failure rates, queue depth, and upstream LLM error codes, surfaced in Azure Monitor dashboards.

### Tauri auto-updater
Signed `.app.tar.gz` artifacts and a hosted update manifest so the macOS shell can pull updates in the background without a manual reinstall.

### Client-side Ollama wrap generation
Skip the queue entirely when Ollama is reachable from the browser. Includes a settings UI for the Ollama URL and a status badge showing whether the local runtime is reachable.

### GitLab sync throttling and call visibility
Respect GitLab's secondary rate-limit headers and surface the active provider in the contribution feed so users can see which sync is running.

---

## Considering
Haven't committed to it (yet)

### Shareable highlight wheels
Export a public bundle of selected slides — with a revocation link — so recipients can view a curated recap without needing an account.

### Composer — music-synced video render service
A render pipeline that turns a generated wrap into a short video with a synced soundtrack, exportable as an MP4.

### Interactive sense-making session
A live session where multiple contributors explore a shared wrap together — branching narratives, annotations, and follow-up questions to the underlying data.

### Wrap from the record
Generate a wrap directly from a completed contribution record (PR list, commit log) as a first-class entry point, separate from the manual-import flow.

---

*Last updated: May 31, 2026*
