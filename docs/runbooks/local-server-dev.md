# Runbook: Run the server locally

End-to-end local development — emulated Azure Storage, Service Bus, and the
Azure Functions host — without any cloud resources or real LLM spend (use a
free-tier Anthropic key or the Azure Foundry endpoint of your choice).

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Docker (with Compose v2) | ≥ 24 | Runs Azurite + Service Bus emulator |
| Azure Functions Core Tools | v4 | `npm i -g azure-functions-core-tools@4` |
| Node | 20 | Matches Functions runtime |
| pnpm | ≥ 10 | `npm i -g pnpm` |

## Steps

### 1. Start the emulators

From the repo root:

```bash
docker compose up -d
```

This starts three containers (`wrapped-local` network):

- **azurite** — Azure Blob/Queue/Table Storage on ports 10000–10002
- **mssql** — SQL Server (Service Bus emulator dependency)
- **servicebus-emulator** — Azure Service Bus on ports 5672 and 5300, with
  the `wrap-jobs` queue pre-configured via `servicebus-config.json`

Wait ~10 s for SQL Server to initialise before the Service Bus emulator
connects. Check readiness:

```bash
docker compose ps          # all three should be "running"
docker compose logs servicebus --tail 20   # look for "Emulator Service is Successfully Up!"
```

### 2. Configure the server

```bash
cp server/local.settings.json.example server/local.settings.json
```

Open `server/local.settings.json` and fill in at least one LLM credential:

```json
"ANTHROPIC_API_KEY": "sk-ant-…"
```

or for Azure Foundry:

```json
"AZURE_FOUNDRY_PROJECT_ENDPOINT": "https://<hub>.services.ai.azure.com/api/projects/<project>",
"AZURE_FOUNDRY_API_VERSION": "2024-12-01-preview"
```

Everything else is pre-wired to point at the local emulators — no changes
needed for Storage or Service Bus unless you changed the Docker port bindings.

### 3. Install dependencies and start the Functions host

```bash
cd server
pnpm install
func start
```

The host binds to `http://localhost:7071`. All four HTTP functions and the
Service Bus trigger (`wrapWorker`) register on start. You should see:

```
Functions:
  authRegister: [POST] http://localhost:7071/api/auth/register
  classify:     [POST] http://localhost:7071/api/classify
  wrapEnqueue:  [POST] http://localhost:7071/api/wrap
  wrapGet:      [GET]  http://localhost:7071/api/wrap/{jobId}
  wrapWorker:   serviceBusTrigger
```

### 4. Start the client

In a separate terminal, from the repo root:

```bash
pnpm dev
```

The client defaults to `http://localhost:7071` for the API
(`NEXT_PUBLIC_WRAP_API_URL` is unset in dev, which makes `src/lib/ai/endpoint.ts`
fall back to that origin). Open `http://localhost:3000`.

### 5. Smoke test

```bash
BASE=http://localhost:7071/api

# Register an install token (should return 200 + { token: "..." })
curl -s -X POST $BASE/auth/register | jq .

# Classify call (401 without token — auth is live)
curl -s -o /dev/null -w "%{http_code}" -X POST $BASE/classify
```

## Tearing down

```bash
docker compose down        # stop and remove containers (data not persisted)
```

To wipe emulator state between runs: `docker compose down -v` (drops volumes).

## Troubleshooting

| Symptom | Check |
|---------|-------|
| `func start` fails — `Microsoft.Azure.WebJobs.ServiceBus` error | Service Bus emulator not ready; wait 10–15 s and retry |
| `func start` fails — storage connection error | Azurite not running; `docker compose ps` to confirm |
| `wrapWorker` never fires after enqueue | Service Bus emulator not yet connected to SQL; `docker compose restart servicebus` |
| `/api/auth/register` returns 500 | `WRAP_JWT_SECRET` is empty in `local.settings.json`; the example value is fine for local use |
| LLM calls return 401 | `ANTHROPIC_API_KEY` or `AZURE_FOUNDRY_PROJECT_ENDPOINT` missing or invalid in `local.settings.json` |
| Client gets CORS errors | Confirm `local.settings.json` `Host.CORS` includes `http://localhost:3000` (it does in the example) |
| Job stuck in `queued` | Check `ServiceBusConnection` string in `local.settings.json` matches the emulator (it does in the example) |

## Coming up: Ollama provider (local-only mode)

A future spec will wire an **Ollama provider** into `server/src/ai/client.ts`,
letting the Functions host call a locally-running Ollama instance instead of
Anthropic or Azure Foundry. Once that lands, the full wrap-generation pipeline
— contribution ingestion, classification, and all ten slice generators — will
run completely offline with no external API keys required. The local dev setup
above will remain the foundation; the only addition will be a running Ollama
process and an `OLLAMA_BASE_URL` entry in `local.settings.json`.
