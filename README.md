# Wrapped for Work — Local-First Prototype

A local-first Next.js prototype of **Wrapped for Work** (Spotify-Wrapped-style
year-end recap for engineering contributions).

User data lives **on the user's device**, encrypted with a passphrase-derived
key. The hosted backend is a **stateless Azure Functions service** — it enqueues
wrap-generation jobs, runs the LLM fan-out, and returns the result, but never
persists contribution text or wrap artifacts beyond the in-flight job lifetime.

## Setup

```bash
# 1. Client
cp .env.local.example .env.local   # sets NEXT_PUBLIC_WRAP_API_URL=http://localhost:7071/api
pnpm install
pnpm dev

# 2. Server (separate terminal)
cp server/local.settings.json.example server/local.settings.json
# Edit local.settings.json: set WRAP_JWT_SECRET, ANTHROPIC_API_KEY and/or Azure vars
cd server && pnpm install
func start                         # Azure Functions Core Tools, port 7071
```

Open [http://localhost:3000](http://localhost:3000), set a passphrase, choose
**Try with demo data** to populate 134 sample contributions.

## Architecture

```
┌──────────────── Mac browser (or Tauri shell) ────────────────┐
│ React UI ──► local-store ──► Dexie (IndexedDB)               │
│                       │       encrypted-envelope rows        │
│                       └──► WebCrypto AES-GCM-256 (in-memory) │
│                                                              │
│  src/lib/ai/  (thin HTTP wrappers — no LLM SDK)              │
│   POST /classify   { freeText, source }                      │
│   POST /wrap       { contributions[], mode, window, jobId }  │
│   GET  /wrap/{jobId}   (poll until complete)                 │
└──────────┬───────────────────────────────────────────────────┘
           │ TLS · Bearer install-JWT · no userId
           ▼
┌──────────────── Azure Functions (server/) ───────────────────┐
│  POST /classify ──► classify() ──► LLM                       │
│  POST /wrap     ──► enqueue job ──► Service Bus              │
│  GET  /wrap/{id}──► read job row from Table Storage          │
│  POST /auth/register ──► issue per-install JWT               │
│                                                              │
│  [Service Bus trigger]                                       │
│  wrapWorker ──► generateWrap() ──► 10 × createSlice          │
│             ──► write result to Table Storage                │
│                                                              │
│  No contribution text persisted. Logs error codes only.      │
└──────────────────────────────────────────────────────────────┘
```

## Privacy model

**What stays on your device** (encrypted):
- Every contribution's `signal`, `rawData`, and `externalUrl`
- Every wrap's `sliceContent` and `title`

**What lives plaintext locally** (used as IndexedDB indexes):
- `id`, `occurredAt`, `category`, `source`, `weight`, `mode`, `createdAt`
- A 16-byte device-local salt and a `seeded: true` flag

**What crosses the wire to the backend** (in transit only, never persisted beyond the job lifetime):
- `/classify`: `{ freeText, source }`
- `/wrap` (enqueue): contributions stripped of `userId`, `id`, `externalId`; the Service Bus message is consumed once by the worker and then deleted
- `/wrap/{jobId}` (poll): only the `jobId`; result is deleted from Table Storage on first successful read

**What the backend stores**:
- A job row: `{ installId, jobId, status, busy, timestamps }` — no contributions, no IPs, no tokens
- A result row (deleted on first read): `{ sliceContent }` encrypted at rest by Azure Table Storage

**Trust boundaries we cannot eliminate**:
- **The LLM provider** (Anthropic or Azure AI) sees plaintext at inference time.
  For stronger guarantees, route via the zero-retention enterprise tier or a local model.
- **An attacker on your unlocked device** can read everything the app can read.
  The passphrase only protects data at rest.
- **An attacker with raw IndexedDB access** (e.g. an extension) learns the
  *shape* of activity (counts per day/category) without learning contents.

## Encryption

- AES-GCM-256 with a 96-bit random IV per record.
- Key derived via PBKDF2-SHA-256 (600 000 iterations, 16-byte device salt).
- Key cached in memory only. Cleared on tab hide + 15-minute idle, on explicit
  lock, and on `beforeunload`.
- See `src/lib/local-store/crypto.ts`.

## Storage durability

Browsers may evict IndexedDB under storage pressure (Safari evicts after ~7
days of inactivity by default). The app calls
`navigator.storage.persist()` on first unlock to request the persistent
storage bucket. For long-term durability, ship the **Tauri shell**
(`src-tauri/`) — it pins data to the macOS filesystem and uses the OS
Keychain for the encryption key.

## Demo data

`public/demo-contributions.json` ships 134 mocked contributions across
GitHub, Jira, Slack, Confluence, and manual notes. To regenerate:

```bash
pnpm export:demo
```

## Tauri shell (v2)

A native macOS `.app` that bundles the same Next.js static export the
browser app produces. Crypto, storage, and AI calls are identical — the
shell is a thin WKWebView wrapper.

### Prerequisites (one-time)

```bash
# Rust toolchain (1.77+)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh && rustup update
xcode-select --install   # macOS linker
```

`@tauri-apps/cli` is already a devDependency — no separate CLI install needed.

### Dev

```bash
# Terminal 1 — backend (AI calls)
cd server && func start          # port 7071

# Terminal 2 — native shell (opens a macOS window against localhost:3000)
pnpm tauri:dev
```

Hot-reload works normally. No Rust rebuild when you edit React components.

```bash
pnpm tauri:check   # cargo check — CI-friendly, no window opened
```

### Build

```bash
export NEXT_PUBLIC_WRAP_API_URL=https://<your-function-app>.azurewebsites.net/api
pnpm tauri:build
```

Produces an unsigned `.app` and `.dmg` under
`src-tauri/target/release/bundle/`. On first launch, right-click → Open to
bypass Gatekeeper, or strip the quarantine attribute:

```bash
xattr -dr com.apple.quarantine \
  "src-tauri/target/release/bundle/macos/Wrapped for Work.app"
```

`NEXT_PUBLIC_WRAP_API_URL` is baked into the bundle's Content Security Policy
at build time by `scripts/tauri-csp.mjs`. Set it before every distribution
build.

See `src-tauri/README.md` for the full runbook (prerequisites, CSP config,
signing notes).

## Tests

```bash
# Client
pnpm typecheck       # tsc --noEmit
pnpm test            # Vitest: unit, component, integration (mocked backend)
pnpm test:watch      # Vitest in watch mode
pnpm test:e2e        # Playwright e2e (boots dev server, real browser)

# Server
cd server
pnpm typecheck
pnpm test            # Vitest: AI layer, function handlers, privacy invariants
pnpm ai:test         # AI integration with MSW-mocked Anthropic (fast)
pnpm ai:test:live    # Same suite against the real Anthropic API
```

Test layout:

- `test/unit/` — crypto round-trip, local-store CRUD, client AI thin-wrapper, privacy invariants (static-analysis: asserts `src/app/api/` absent).
- `test/component/` — UnlockGate (React Testing Library, happy-dom).
- `test/integration/` — provider orchestrator smoke.
- `test/e2e/` — Playwright specs: locality (clear site data → fresh state), encryption-at-rest (raw IDB rows have no plaintext signal), network minimality (payloads carry no `userId`/`id`/`externalId`).
- `server/test/unit/` — AI client, classify, generate, function handlers, privacy invariants.
- `server/test/integration/` — wrap pipeline smoke against MSW-mocked Anthropic; gated by `INTEGRATION_LIVE=1`.
- `test/fixtures/`, `test/mocks/`, `test/setup/` — shared fixtures, MSW handlers, Vitest setup.

CI runs typecheck + lint + unit + build for both packages, then a separate Playwright job. A manual `workflow_dispatch` job runs the live AI smoke against a `secrets.ANTHROPIC_API_KEY`.

## Verification checklist

- **Locality**: clear browser site data → reload → empty state returns.
- **Encryption at rest**: open IndexedDB → confirm `signal`/`rawData` are
  opaque byte arrays, not strings.
- **Network minimality**: DevTools Network tab on the `/wrap` enqueue POST →
  assert payload contains no `userId`, no `id`, no `externalId`.
- **Server silence**: no Prisma in the codebase, no `db.*` imports outside
  `src/lib/local-store/`.

## Included flows

- Passphrase setup / unlock at app entry
- Encrypted contribution timeline at `/dashboard`
- Manual contribution entry (AI-classified, then stored locally)
- Wrap generation at `/wrap/[localId]` with 10 mode-aware slides
- Export-as-JSON for sharing a wrap (the URL itself is no longer
  server-resolvable)
- AI smoke testing via `pnpm ai:test`
