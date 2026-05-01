# Wrapped for Work — Local-First Prototype

A local-first Next.js prototype of **Wrapped for Work** (Spotify-Wrapped-style
year-end recap for engineering contributions).

User data lives **on the user's device**, encrypted with a passphrase-derived
key. The hosted backend is a **stateless AI proxy** — it forwards prompts to
Anthropic and returns the result, but never stores contribution text or wrap
artifacts.

## Setup

1. `cp .env.local.example .env.local`
2. Add your `ANTHROPIC_API_KEY` to `.env.local`
3. `pnpm install`
4. `pnpm dev`
5. Open [http://localhost:3000](http://localhost:3000), set a passphrase,
   choose **Try with demo data** to populate 134 sample contributions.

## Architecture

```
┌──────────────── Mac browser (or Tauri shell) ────────────────┐
│ React UI ──► local-store ──► Dexie (IndexedDB)               │
│                       │       encrypted-envelope rows        │
│                       └──► WebCrypto AES-GCM-256 (in-memory) │
│                                                              │
│  POST /api/classify   { freeText, source }                   │
│  POST /api/wrap       { contributions[], mode, window }      │
└──────────┬───────────────────────────────────────────────────┘
           │ TLS · no cookies · no userId
           ▼
┌──────────────── Stateless Next.js backend ───────────────────┐
│  /api/classify, /api/wrap                                    │
│  - reads input, calls Anthropic, returns output              │
│  - no DB, no payload logging, no Prisma                      │
│  - holds ANTHROPIC_API_KEY only                              │
└──────────────────────────────────────────────────────────────┘
```

## Privacy model

**What stays on your device** (encrypted):
- Every contribution's `signal`, `rawData`, and `externalUrl`
- Every wrap's `sliceContent` and `title`

**What lives plaintext locally** (used as IndexedDB indexes):
- `id`, `occurredAt`, `category`, `source`, `weight`, `mode`, `createdAt`
- A 16-byte device-local salt and a `seeded: true` flag

**What crosses the wire to our backend** (in transit only, never persisted):
- `/api/classify`: `{ freeText, source }`
- `/api/wrap`: an array of contributions stripped of `userId`, `id`, `externalId`

**What our backend does**:
- Forwards the request to `https://api.anthropic.com/v1/messages` with our
  `ANTHROPIC_API_KEY`
- Returns the response to the caller
- Logs only error status codes and messages (never request bodies)
- Has no database — `prisma/` was removed in the migration to local-first

**Trust boundaries we cannot eliminate**:
- **Anthropic** sees plaintext at inference time. This is the documented
  residual risk. For stronger guarantees, route requests via the Anthropic
  zero-retention enterprise tier or run a local LLM in a future iteration.
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

```bash
pnpm tauri:dev    # requires Rust toolchain
pnpm tauri:build  # builds .dmg for macOS
```

See `src-tauri/README.md` for bootstrap instructions.

## Tests

```bash
pnpm typecheck       # tsc --noEmit
pnpm test            # Vitest: unit, component, integration (mocked Anthropic)
pnpm test:watch      # Vitest in watch mode
pnpm test:e2e        # Playwright e2e (boots dev server, real browser)
pnpm ai:test         # AI integration with MSW-mocked Anthropic (fast)
pnpm ai:test:live    # Same suite against the real Anthropic API
```

Test layout:

- `test/unit/` — crypto round-trip, local-store CRUD, AI classify/generate/client, API route handlers, privacy invariants (static-analysis).
- `test/component/` — UnlockGate (React Testing Library, happy-dom).
- `test/integration/` — wrap pipeline smoke against MSW-mocked Anthropic; gate live runs behind `INTEGRATION_LIVE=1`.
- `test/e2e/` — Playwright specs: locality (clear site data → fresh state), encryption-at-rest (raw IDB rows have no plaintext signal), network minimality (`/api/wrap` payloads carry no `userId`/`id`/`externalId`).
- `test/fixtures/`, `test/mocks/`, `test/setup/` — shared fixtures, MSW handlers, and Vitest setup files.

CI runs typecheck + lint + unit + build, then a separate Playwright job. A manual `workflow_dispatch` job runs the live AI smoke against a `secrets.ANTHROPIC_API_KEY`.

## Verification checklist

- **Locality**: clear browser site data → reload → empty state returns.
- **Encryption at rest**: open IndexedDB → confirm `signal`/`rawData` are
  opaque byte arrays, not strings.
- **Network minimality**: DevTools Network tab on `/api/wrap` → assert
  payload contains no `userId`, no `id`, no `externalId`.
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
