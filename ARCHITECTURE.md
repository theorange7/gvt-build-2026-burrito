# Architecture

## One-paragraph summary

A local-first Next.js app. User contribution data lives in IndexedDB on the
device, encrypted with a passphrase-derived AES-GCM key. Two stateless API
routes proxy LLM calls (`/api/classify`, `/api/wrap`) — they hold the
upstream credentials, but never persist or log payloads. The wrap experience
is composed from ten parallel slice prompts. The shipping target for v2 is
a Tauri 2 macOS shell that pins data to disk and uses the OS Keychain.

## System diagram

```
┌──────────────── Browser (or Tauri shell) ─────────────────────┐
│                                                               │
│  React UI (Next.js App Router)                                │
│   │                                                           │
│   ├── UnlockGate ──► crypto.deriveKey(passphrase, salt) ──┐   │
│   │                                                       ▼   │
│   │                                                 in-mem KEY│
│   │                                                       │   │
│   ├── DashboardShell ──► useContributions ──► local-store     │
│   │                                              │            │
│   │                                              ▼            │
│   │                                         Dexie / IDB       │
│   │                                  ┌─────────┴──────────┐   │
│   │                                  │  contributions     │   │
│   │                                  │  wraps             │   │
│   │                                  │  meta              │   │
│   │                                  │  (rows = envelope: │   │
│   │                                  │   plaintext index +│   │
│   │                                  │   ciphertext blob) │   │
│   │                                  └────────────────────┘   │
│   │                                                           │
│   ├── ManualInputForm ── POST /api/classify                   │
│   └── GenerateWrapModal ── POST /api/wrap                     │
│                                                               │
└─────────────────┬─────────────────────────────────────────────┘
                  │ TLS only · no cookies · no userId
                  ▼
┌──────────────── Stateless Next.js backend ────────────────────┐
│  /api/classify ──► classify() ──► callClaude (alias)          │
│  /api/wrap     ──► generateWrap() ──► 10 × createSlice        │
│                                          │                    │
│                                          ▼                    │
│                                   callModel(modelId)          │
│                                   ├── callAnthropic           │
│                                   │     POST api.anthropic.com│
│                                   └── callAzureFoundry        │
│                                         AIProjectClient       │
│                                         .getAzureOpenAIClient │
│                                         .chat.completions     │
└────────────────────────┬──────────────────────────────────────┘
                         │
                ┌────────┴────────┐
                ▼                 ▼
         api.anthropic.com   *.services.ai.azure.com
```

## Trust boundaries

| Boundary           | What we control                                    | What we accept            |
|--------------------|----------------------------------------------------|---------------------------|
| Device → backend   | Strip identifiers; TLS; no cookies                 | Backend sees plaintext    |
| Backend → upstream | Only error metadata logged; no DB; no aggregation  | Upstream sees plaintext   |
| At rest (IDB)      | Encrypted ciphertext; in-memory key                | Indexed shape is observable |
| Unlocked device    | Idle lock + tab-hide lock                          | App is fully readable     |

The backend is intentionally a *thin proxy*. It holds API credentials so the
client doesn't, but it does not persist, aggregate, or log request bodies.

## Data flow — capturing a contribution

1. User pastes free text into `ManualInputForm`.
2. Browser POSTs `{ freeText, source }` to `/api/classify`.
3. Route calls `classify()` (`src/lib/ai/classify.ts`), which calls
   `callClaude` and parses a JSON `{ signal, category, weight }`.
4. Result returned to client. Client encrypts the secret payload
   (`signal`, `rawData`, `userId`, `externalId`, `externalUrl`) via
   `encryptJSON` and writes a `ContributionRow` to Dexie. The plaintext
   columns (`id`, `occurredAt`, `source`, `category`, `weight`,
   `createdAt`) are kept for IndexedDB indexing.
5. React Query invalidates the contributions query; the feed updates.

## Data flow — generating a wrap

1. User opens `GenerateWrapModal`, picks a window, mode, and a model from
   `MODEL_OPTIONS` (loaded from `src/lib/ai/models.config.json`).
2. Browser fetches local contributions via `listContributionsInRange`,
   strips them down to `{ source, category, signal, rawData, occurredAt,
   weight }`, and POSTs to `/api/wrap` with `{ contributions, mode,
   windowStart, windowEnd, modelId }`.
3. The route calls `generateWrap`, which fans out across 10 slice prompts
   in parallel via `Promise.allSettled`. Each prompt:
   - filters contributions by category/weight,
   - calls `callModel(systemPrompt, userMessage, modelId)` via
     `createSlice`,
   - parses a strict JSON response into `SliceContent`.
4. Failed slices fall back to a placeholder (`fallbackForSlice`) so the
   wrap is never half-empty.
5. Browser encrypts the resulting `sliceContent` array and persists a
   `WrapRow` via `saveWrap`. Then redirects to `/wrap/[id]`.

## Encryption envelope

Defined in `src/lib/local-store/crypto.ts`.

- **KDF**: PBKDF2-SHA-256, 600 000 iterations, 16-byte device-local salt
  (stored plaintext in `meta` table).
- **Cipher**: AES-GCM with 256-bit key, 96-bit random IV per record.
- **Storage**: each row stores `{ iv: Uint8Array, ct: Uint8Array }`
  alongside indexed plaintext columns for query.
- **Key lifecycle**:
  - Derived once at unlock; held in module-level `cachedKey`.
  - Cleared on `lock()`, on `beforeunload`, and on tab hide + 15-minute
    idle.
  - Never written to localStorage / sessionStorage.
- **Loss model**: if the user forgets the passphrase, data is unrecoverable.
  No reset, no escrow, no hint stored beyond the optional plaintext
  `passphraseHint` (deliberately advisory).

## Model selection

Configured in `src/lib/ai/models.config.json`, validated at import time by
`src/lib/ai/models.ts`. Each entry declares a provider and a `parameters`
object that gets spread verbatim into the upstream chat-completions request.

- **Anthropic** path: direct POST to `https://api.anthropic.com/v1/messages`
  with `ANTHROPIC_API_KEY`. Three-attempt retry on 429/529.
- **Azure Foundry** path:
  - `new AIProjectClient(AZURE_FOUNDRY_PROJECT_ENDPOINT,
    new DefaultAzureCredential())`.
  - `project.getAzureOpenAIClient({ apiVersion })` returns an
    `AzureOpenAI` client (clients cached by api-version).
  - `openai.chat.completions.create({ model: deploymentName, messages, ...parameters })`.
  - `model.modelId` is the **deployment name** in your Foundry project, not
    the model family.
  - 404 errors include a hint about deployment name + api-version.

The wrap modal renders a dropdown over `MODEL_OPTIONS`. The selected `id`
is sent to `/api/wrap`; the route resolves it and threads `modelId` through
`generateWrap` → each `generate*` prompt → `createSlice` → `callModel`.

`callClaude` is retained as a deprecated alias for `callModel` so existing
imports (notably `classify.ts` and the test suite) keep working.

## Slice generation

Ten slices, one component each (`src/components/slides/*`) and one prompt
each (`src/lib/ai/prompts/*`):

| Slice                | Categories used                  | Notes                              |
|----------------------|----------------------------------|------------------------------------|
| `launches_shipped`   | delivery (weight ≥ 4)            | Major shipped outcomes             |
| `velocity`           | delivery                         | Throughput across the window       |
| `cross_team_impact`  | collaboration                    | Reviews/unblockers                 |
| `deep_work_streak`   | delivery, process (weight ≥ 3)   | Focused bursts                     |
| `mentorship`         | mentorship                       | Helping teammates grow             |
| `initiative`         | leadership, delivery (weight ≥ 4)| Self-started work                  |
| `collaboration_style`| collaboration, process           | Async habits                       |
| `consistency`        | delivery, collaboration          | Distribution across time           |
| `highlight_reel`     | all (weight ≥ 4, top 3)          | Three defining moments             |
| `identity`           | all (top 5)                      | Synthesizes signature style        |

`createSlice` (`shared.ts`):
- Filters to relevant contributions; if fewer than 2, returns the fallback
  immediately (no API call).
- Builds the user message: slice name, coverage, mode, tone instruction,
  formatted contribution list, and a strict JSON schema example.
- Mode `snapshot` → 140-char body, terse, stat-forward.
- Mode `year-end` → 280-char body, editorial, may include `supporting[]`.
- Parses the JSON response; on any failure returns `fallbackForSlice`.

## Storage schema (Dexie)

```ts
contributions: 'id, occurredAt, category, source, weight, createdAt'
wraps:         'id, mode, createdAt'
meta:          'key'
```

`meta` stores `kdfSalt` (Uint8Array), `seeded` (boolean),
`passphraseHint` (optional string).

## Tauri shell (v2 distribution)

`src-tauri/` hosts the Tauri 2 macOS bundle. The Next.js frontend is
exported as static assets (`output: 'export'` when `TAURI=1`); there is no
Node server in the .app. The proxy routes are expected to run as a remote
service.

Future-state v2 capabilities:
- Replace the in-memory `cachedKey` with `tauri-plugin-stronghold` /
  Keychain-backed storage.
- Pin data to the macOS filesystem instead of IDB to sidestep Safari's
  7-day eviction.
- Native menus, smaller surface area than Electron.

## Testing topology

- **`test/unit/privacy-invariants.test.ts`** — static analysis: no Prisma,
  no `node:fs` in API routes, no local-store imports under `src/lib/ai/**`
  or `src/app/api/**`, every API route carries a `PRIVACY` banner.
- **`test/unit/crypto.test.ts`** — encrypt/decrypt round-trip, key
  lifecycle.
- **`test/unit/{contributions,wraps}.test.ts`** — Dexie CRUD via
  `fake-indexeddb`.
- **`test/unit/{client,classify,generate,api-classify,api-wrap}.test.ts`**
  — AI surface mocked at the network with MSW.
- **`test/component/`** — UnlockGate behavior under happy-dom.
- **`test/integration/wrap.test.ts`** — full pipeline against MSW; live
  variant gated by `INTEGRATION_LIVE=1`.
- **`test/e2e/`** — Playwright verifies the three privacy invariants in a
  real browser:
  - `locality.spec.ts`: clear site data → fresh state.
  - `encryption.spec.ts`: raw IDB rows have no plaintext signal.
  - `network-minimality.spec.ts`: `/api/wrap` payload contains no
    `userId`, `id`, or `externalId`.

## Operational env vars

| Var                              | Used by                          | Notes                                         |
|----------------------------------|----------------------------------|-----------------------------------------------|
| `ANTHROPIC_API_KEY`              | `callAnthropic`                  | Required only for the Anthropic provider.     |
| `AZURE_FOUNDRY_PROJECT_ENDPOINT` | `callAzureFoundry`               | `https://<acct>.services.ai.azure.com/api/projects/<project>` |
| `AZURE_FOUNDRY_API_VERSION`      | `callAzureFoundry`               | Optional global override; per-model `version` wins. |
| `APP_ENV`                        | UI                               | Free-form environment label.                  |
| `NEXT_PUBLIC_APP_URL`            | UI                               | Used by demo links / clipboard.               |
| `TAURI=1`                        | `next.config.mjs`                | Switches Next to static export for the shell. |
| `INTEGRATION_LIVE=1`             | `test/integration/wrap.test.ts`  | Bypasses MSW, hits real upstream.             |
