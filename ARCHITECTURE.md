# Architecture

## One-paragraph summary

A local-first Next.js app backed by a separately deployed Azure Functions
service. User contribution data lives in IndexedDB on the device, encrypted
with a passphrase-derived AES-GCM key. The client calls the Functions backend
via a per-install Bearer JWT; the backend classifies contributions and runs
async wrap generation (enqueue → Service Bus → worker → Table Storage result).
The wrap experience is composed from ten parallel slice prompts. The shipping
target for v2 is a Tauri 2 macOS shell that pins data to disk and uses the OS
Keychain.

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
│   │  src/lib/ai/  (thin HTTP wrappers — no LLM SDK)           │
│   ├── ManualInputForm ── POST /classify                       │
│   └── GenerateWrapModal ── POST /wrap (enqueue)               │
│                            GET  /wrap/{jobId} (poll)          │
│                                                               │
└─────────────────┬─────────────────────────────────────────────┘
                  │ TLS · Bearer install-JWT · no userId
                  ▼
┌──────────────── Azure Functions (server/) ────────────────────┐
│  POST /classify   ──► classify() ──► LLM                      │
│  POST /wrap       ──► createJobRow ──► Service Bus enqueue    │
│  GET  /wrap/{id}  ──► read wrapJobs Table Storage             │
│  POST /auth/register ──► sign per-install JWT                 │
│                                                               │
│  [Service Bus trigger]                                        │
│  wrapWorker ──► generateWrap() ──► 10 × createSlice           │
│             ──► callModel(modelId)                            │
│                  ├── callAnthropic  → api.anthropic.com       │
│                  └── callAzureFoundry → AIProjectClient       │
│             ──► write result → wrapResults Table Storage      │
└────────────────────────┬──────────────────────────────────────┘
                         │
        ┌────────────────┼──────────────────┐
        ▼                ▼                  ▼
 api.anthropic.com  *.services.ai.azure.com  Azure Service Bus
                                             Azure Table Storage
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
2. Browser POSTs `{ freeText, source }` to `/classify` on the Functions
   backend (`src/lib/ai/classify.ts` builds the request).
3. `server/src/functions/classify.ts` calls `classify()` (`server/src/ai/classify.ts`),
   which calls `callModel` and parses a JSON `{ signal, category, weight }`.
4. Result returned to client. Client encrypts the secret payload
   (`signal`, `rawData`, `userId`, `externalId`, `externalUrl`) via
   `encryptJSON` and writes a `ContributionRow` to Dexie. The plaintext
   columns (`id`, `occurredAt`, `source`, `category`, `weight`,
   `createdAt`) are kept for IndexedDB indexing.
5. React Query invalidates the contributions query; the feed updates.

## Data flow — generating a wrap

1. User opens `GenerateWrapModal`, picks a window, mode, and a model from
   `MODEL_OPTIONS` (loaded from `server/src/ai/models.config.json`).
2. Browser fetches local contributions via `listContributionsInRange`,
   strips them down to `{ source, category, signal, rawData, occurredAt,
   weight }`, and calls `enqueueWrap` (`src/lib/ai/generate.ts`), which
   POSTs `{ jobId, contributions, mode, windowStart, windowEnd, modelId }`
   to `/wrap`.
3. `server/src/functions/wrapEnqueue.ts` creates a job row in Table Storage,
   checks per-install and global concurrency caps, and pushes a Service Bus
   message containing the full payload plus an opaque `jobLookupToken`.
4. Client polls `GET /wrap/{jobId}` via `pollWrap` until `status` is
   `complete` or `failed`.
5. `server/src/functions/wrapWorker.ts` (Service Bus trigger) calls
   `generateWrap`, which fans out across 10 slice prompts in parallel via
   `Promise.allSettled`. Each prompt:
   - filters contributions by category/weight,
   - calls `callModel(systemPrompt, userMessage, modelId)` via `createSlice`,
   - parses a strict JSON response into `SliceContent`.
   Failed slices fall back to a placeholder (`fallbackForSlice`) so the wrap
   is never half-empty.
6. Worker writes the result to the `wrapResults` table and marks the job
   `complete`. On first `GET /wrap/{jobId}` that returns `complete`, the
   result row and job row are deleted (one-time read).
7. Browser encrypts the resulting `sliceContent` array and persists a
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

Configured in `server/src/ai/models.config.json`, validated at import time by
`server/src/ai/models.ts`. Each entry declares a provider and a `parameters`
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

The wrap modal renders a dropdown over `MODEL_OPTIONS` (fetched from the
server's config). The selected `id` is sent with the enqueue request;
`wrapWorker` resolves it and threads `modelId` through
`generateWrap` → each `generate*` prompt → `createSlice` → `callModel`.

## Slice generation

Ten slices, one component each (`src/components/slides/*`) and one prompt
each (`server/src/ai/prompts/*`):

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

`createSlice` (`server/src/ai/shared.ts`):
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

**Client (`test/`)**

- **`test/unit/privacy-invariants.test.ts`** — static analysis: `src/app/api/`
  absent; `src/lib/ai/**` imports no LLM/Azure SDK and reads no server-only env;
  `shared/` is types-only; providers are storage-pure.
- **`test/unit/crypto.test.ts`** — encrypt/decrypt round-trip, key lifecycle.
- **`test/unit/{contributions,wraps}.test.ts`** — Dexie CRUD via `fake-indexeddb`.
- **`test/component/`** — UnlockGate behavior under happy-dom.
- **`test/integration/`** — provider orchestrator smoke.
- **`test/e2e/`** — Playwright verifies privacy invariants in a real browser:
  - `locality.spec.ts`: clear site data → fresh state.
  - `encryption.spec.ts`: raw IDB rows have no plaintext signal.
  - `network-minimality.spec.ts`: enqueue payload contains no `userId`, `id`, or `externalId`.

**Server (`server/test/`)**

- **`server/test/unit/privacy-invariants.test.ts`** — static analysis: PRIVACY
  banners in every function, no payload logging.
- **`server/test/unit/{client,classify,generate}.test.ts`** — AI layer mocked
  at the network with MSW.
- **`server/test/integration/wrap.test.ts`** — full pipeline against MSW; live
  variant gated by `INTEGRATION_LIVE=1`.

## Operational env vars

### Client (`.env.local`)

| Var                        | Notes                                                           |
|----------------------------|-----------------------------------------------------------------|
| `NEXT_PUBLIC_WRAP_API_URL` | Base URL of the Functions backend. `http://localhost:7071/api` for local dev. |
| `APP_ENV`                  | Free-form environment label shown in the UI.                    |
| `NEXT_PUBLIC_APP_URL`      | Used by demo links / clipboard.                                 |
| `TAURI=1`                  | Switches Next to static export for the Tauri shell.             |

### Server (`server/local.settings.json` / Azure App Settings)

| Var                                      | Notes                                                                          |
|------------------------------------------|--------------------------------------------------------------------------------|
| `WRAP_JWT_SECRET`                        | HS256 secret for signing/verifying per-install tokens. Store in Key Vault.     |
| `ANTHROPIC_API_KEY`                      | Required for the Anthropic provider.                                           |
| `AZURE_FOUNDRY_PROJECT_ENDPOINT`         | `https://<acct>.services.ai.azure.com/api/projects/<project>`                  |
| `AZURE_FOUNDRY_API_VERSION`              | Optional global override; per-model `version` in `models.config.json` wins.   |
| `AZURE_SERVICE_BUS_NAMESPACE`            | `<ns>.servicebus.windows.net` — used by the enqueue function.                  |
| `ServiceBusConnection__fullyQualifiedNamespace` | Same namespace — used by the Service Bus trigger binding.             |
| `AZURE_SERVICE_BUS_QUEUE_NAME`           | Default `wrap-jobs`.                                                           |
| `AZURE_TABLES_ENDPOINT`                  | Table Storage account endpoint.                                                |
| `AZURE_TABLES_JOBS`                      | Table name for job rows. Default `wrapJobs`.                                   |
| `AZURE_TABLES_RESULTS`                   | Table name for result rows. Default `wrapResults`.                             |
| `WRAP_MAX_CONCURRENCY`                   | Global in-flight cap (default `8`).                                            |
| `WRAP_PER_INSTALL_LIMIT`                 | Per-install in-flight cap (default `1`).                                       |
| `WRAP_RESULT_TTL_HOURS`                  | Hours before an unclaimed result is swept (default `24`).                      |
| `WRAP_REGISTER_RATE_LIMIT_PER_HOUR`      | Max `/auth/register` calls per IP per hour (default `10`).                     |
| `WRAP_MAX_DELIVERIES`                    | Max Service Bus delivery attempts before DLQ (default `3`).                   |

### Test / CI

| Var               | Notes                                                     |
|-------------------|-----------------------------------------------------------|
| `INTEGRATION_LIVE=1` | Bypasses MSW in `server/test/integration/wrap.test.ts`, hits real upstream. |
