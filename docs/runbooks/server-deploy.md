# Runbook: Server deploy (wrap-server.zip)

Manual deploy of the Azure Functions backend to a provisioned Function App.
Infra is managed by Terraform (`infra/`); this runbook covers the code deploy only.

> **Most deploys should go through CI** — see `ci-deploys.md` for the
> `Deploy server` workflow (OIDC-authenticated, smoke-tested, same artifact).
> Use this manual path for hotfixes when CI is broken, when you need to
> redeploy a specific previous zip, or when bootstrapping a new Function App
> before the workflow has been pointed at it.

## Prerequisites

- `az` CLI installed and logged in (`az login`).
- `pnpm` installed (version ≥ 10).
- `zip` available (macOS: built-in; Linux: `apt install zip`).
- `npm` available (used during `pnpm package` to install prod deps).
- The target Function App provisioned via `terraform apply`. Terraform uses Flex
  Consumption with a blob-container deployment model — it does **not** set
  `WEBSITE_RUN_FROM_PACKAGE`.
- All app settings injected by Terraform (`ENV_MODE`, `WRAP_JWT_KEY_v1`,
  `WRAP_JWT_ACTIVE_KID`, LLM keys via Key Vault references, Service Bus FQDN,
  Table Storage endpoint, capacity knobs). See `infra/modules/functions/main.tf`
  for the authoritative list; `server/local.settings.json.example` is for local
  dev only.

## Steps

### 1. Build and package

```bash
# From repo root
cd server && pnpm install
cd ..
pnpm -C server package
```

This runs:
1. `tsc -p tsconfig.build.json` — compiles TypeScript to `server/dist/`
2. `node scripts/copy-assets.mjs` — copies `host.json`, `models.config.json`,
   builds `@wrapped/shared` into `dist/_shared/`, and writes a runtime `package.json`
3. `node scripts/zip-artifact.mjs` — runs `npm install --omit=dev` inside
   `dist/` (pre-installs prod deps), then zips `dist/` into `server/wrap-server.zip`

Expected output tree inside the zip (verify with `unzip -l server/wrap-server.zip`):

```
host.json
index.js
package.json
ai/models.config.json
ai/client.js
ai/models.js
...
functions/authRegister.js
functions/classify.js
functions/meReset.js
functions/wrapEnqueue.js
functions/wrapGet.js
functions/wrapWorker.js
_shared/index.js
_shared/schemas.js
_shared/types.js
_shared/package.json
node_modules/...
```

### 2. Deploy

Replace `<resource-group>` and `<function-app-name>` with your values:

```bash
az functionapp deployment source config-zip \
  --resource-group <resource-group> \
  --name <function-app-name> \
  --src server/wrap-server.zip
```

The command blocks until the deployment completes (typically 30–90 s).

### 3. Smoke test

Confirm the function host registered all routes by calling an endpoint that
returns 401 without a valid token (expected — means the function is up):

```bash
HOSTNAME=https://<function-app-name>.azurewebsites.net

# Should return HTTP 401 (function registered, auth required)
curl -s -o /dev/null -w "%{http_code}" -X POST "${HOSTNAME}/api/wrap"

# Should return HTTP 401
curl -s -o /dev/null -w "%{http_code}" -X POST "${HOSTNAME}/api/classify"

# Should return HTTP 401
curl -s -o /dev/null -w "%{http_code}" -X DELETE "${HOSTNAME}/api/me/data"

# Should return HTTP 200 with a JWT body
curl -s -X POST "${HOSTNAME}/api/auth/register"
```

If `/api/auth/register` returns 200 with a JSON body containing a `token`
field, the deploy succeeded and auth is functional.

### 4. Rollback

Redeploy the previous zip artifact:

```bash
az functionapp deployment source config-zip \
  --resource-group <resource-group> \
  --name <function-app-name> \
  --src server/wrap-server-<previous-version>.zip
```

Keep the previous zip until the new deploy is confirmed healthy. Git tag the
commit used for each deploy so you can rebuild the exact artifact if needed.

## Troubleshooting

| Symptom | Check |
|---------|-------|
| Deploy command returns 4xx | `az login` expiration; re-authenticate |
| Functions 404 after deploy | Confirm zip was deployed via `az functionapp deployment source config-zip`; Flex Consumption does not use `WEBSITE_RUN_FROM_PACKAGE` |
| All endpoints return 500 on startup | `ENV_MODE` not set — Terraform injects this; check `az functionapp config appsettings list` |
| All endpoints return 500 | App settings missing — run `az functionapp config appsettings list` and compare against `infra/modules/functions/main.tf` |
| `/api/auth/register` returns 500 | Key Vault reference for `WRAP_JWT_KEY_v1` not resolving — check managed identity has `Get`/`List` on Key Vault; `WRAP_JWT_SECRET` is the legacy fallback |
| LLM calls fail | `ANTHROPIC_API_KEY` or `AZURE_FOUNDRY_PROJECT_ENDPOINT` Key Vault reference not resolving, or secret value empty |
| Jobs stuck in `queued` | `AZURE_SERVICE_BUS_NAMESPACE` and `ServiceBusConnection__fullyQualifiedNamespace` missing or managed identity lacks Service Bus Data Receiver role |
