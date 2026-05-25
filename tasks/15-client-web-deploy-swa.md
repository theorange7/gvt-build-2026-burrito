# Spec 15 — Client web deploy via Azure Static Web Apps

**Status**: Shaped — ready to pick up
**Branch**: both (client config + infra module + CI workflow + docs)
**Appetite**: small (≤ 1 day; ~half day for the config + infra module, half day for the CI workflow, runbook, and smoke test)
**Last shaped**: 2026-05-25

## Problem

The browser client has no production hosting. `pnpm build` produces a Next.js
build artifact in CI but nothing publishes it. `infra/` provisions the
backend (Function App, Service Bus, Tables, Key Vault) but no client
resource. `.github/workflows/` has `deploy-server.yml` but no client
equivalent. `README.md`'s "Setup" section covers local dev and `pnpm
tauri:build` only — there is no documented path from `git push` to a
reachable URL where someone can open the dashboard in a browser.

Today the only ways to use the app are (a) `pnpm dev` against a local
`func start`, or (b) a Tauri `.app` bundle (spec 40, shipped) that
ships the same static export but is macOS-only, unsigned, and intended
for hand-delivery to testers. Neither is suitable when we want to
point a collaborator at a URL and have them try the wrap flow against
the real deployed backend.

This spec adds the missing leg: the static export gets published to an
Azure Static Web App, the deployed Function App allows the SWA origin
in CORS, and there's a workflow + runbook for shipping a new build.
The shell architecture is unchanged — Tauri keeps building from the
same `out/` directory; this spec just adds a second deploy target for
the exact same artifact.

## Solution shape

Eight pieces, all in one PR. Roughly half client / half infra; the CI
workflow ties them together.

### 1. `next.config.mjs` — unconditional static export

Today the conditional flips on `TAURI=1`. Remove the conditional — both
web and Tauri ship from `out/`, so there is no reason to keep two
build modes:

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  typedRoutes: false,
  output: 'export',
  images: { unoptimized: true },
};

export default nextConfig;
```

Consequences to call out in the PR description:

- `pnpm dev` keeps working. Next logs a warning that `output: 'export'`
  is set in dev mode but runs the dev server normally; the app uses no
  SSR-only features (Tauri has been proving this), so the warning is
  cosmetic.
- `pnpm start` becomes meaningless (no `.next/standalone` produced).
  Either delete the script from `package.json` or repoint it at
  `pnpm exec serve out` so a developer can sanity-check the export
  locally before deploying. Pick the second — it's the static-export
  equivalent of "run the prod artifact".
- `TAURI=1` is no longer load-bearing for `next.config.mjs`. It stays
  meaningful for `scripts/tauri-csp.mjs` (spec 40) and downstream Rust
  tooling — don't drop the env var elsewhere.

### 2. `staticwebapp.config.json` at repo root

Single config file Azure SWA reads from the deployed bundle root.
Three concerns:

- **SPA fallback**: route 404s to `/index.html` so client-side
  navigation works after a hard refresh on a sub-path.
- **CSP header**: lock `connect-src` to the configured backend origin.
  SWA injects the header into every response. The origin is **not**
  templated at build time here (unlike Tauri, where `tauri-csp.mjs`
  bakes it in) because SWA serves a static file — the workflow rewrites
  the placeholder in this file before upload.
- **Cache headers**: long-cache `_next/static/*`, no-cache
  `index.html`. Standard Next-on-CDN posture.

Shape:

```json
{
  "navigationFallback": {
    "rewrite": "/index.html",
    "exclude": ["/_next/*", "/*.{png,svg,json}"]
  },
  "globalHeaders": {
    "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ${WRAP_API_ORIGIN}; frame-ancestors 'none'; base-uri 'self'",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Content-Type-Options": "nosniff"
  },
  "routes": [
    { "route": "/_next/static/*", "headers": { "cache-control": "public, max-age=31536000, immutable" } },
    { "route": "/index.html", "headers": { "cache-control": "no-cache" } }
  ]
}
```

A small `scripts/swa-config.mjs` (≤ 30 lines) does the `${WRAP_API_ORIGIN}`
substitution in CI before the upload step, sourcing the origin from
`NEXT_PUBLIC_WRAP_API_URL` (strip the `/api` suffix). Mirrors
`scripts/tauri-csp.mjs` so the two CSP paths look the same to a reader.

### 3. `infra/modules/static_web_app/`

New module with the standard three files:

- `main.tf` — one `azurerm_static_web_app` resource. SKU `Standard`
  (the free tier doesn't support custom config). Location is one of the
  four SWA regions (`westeurope`, `eastus2`, `centralus`, `eastasia`);
  pin via a module variable defaulting to `westeurope`.
- `variables.tf` — `name`, `resource_group_name`, `location`, `tags`.
- `outputs.tf` — `default_host_name`, `api_key` (the deployment token —
  marked `sensitive = true`).

Wire it into `infra/main.tf` next to the existing module calls. Add
`var.swa_location` to `infra/variables.tf` and the SWA host into the
Function App's `allowed_origins` automatically:

```hcl
module "static_web_app" {
  source              = "./modules/static_web_app"
  name                = "swa-wrapped-${local.suffix}"
  resource_group_name = azurerm_resource_group.main.name
  location            = var.swa_location
  tags                = local.common_tags
}

# ... existing functions module call, with allowed_origins extended:
module "functions" {
  # ...
  allowed_origins = join(",", compact([
    var.wrap_allowed_origins,
    "https://${module.static_web_app.default_host_name}",
  ]))
}
```

`infra/outputs.tf` exposes `static_web_app_default_host_name` and
`static_web_app_deployment_token` (the latter `sensitive`).

### 4. `.github/workflows/deploy-client.yml`

Mirrors `deploy-server.yml` end-to-end. Pre-build the export ourselves
(so we control the env vars at the moment they're inlined into the
bundle), then upload with `skip_app_build: true`:

```yaml
name: Deploy client

on:
  workflow_dispatch:
    inputs:
      environment:
        description: Target environment
        required: true
        type: choice
        options:
          - staging
          - production
      swa_name:
        description: Azure Static Web App name
        required: true
        type: string

permissions:
  id-token: write
  contents: read

jobs:
  deploy:
    name: Build and deploy to ${{ inputs.environment }}
    runs-on: ubuntu-latest
    timeout-minutes: 15
    environment: ${{ inputs.environment }}
    env:
      NEXT_PUBLIC_WRAP_API_URL: ${{ vars.NEXT_PUBLIC_WRAP_API_URL }}
    steps:
      - uses: actions/checkout@08eba0b27e820071cde6df949e0beb9ba4906955  # v4.3.0
        with:
          persist-credentials: false

      - uses: pnpm/action-setup@fc06bc1257f339d1d5d8b3a19a8cae5388b55320  # v4.4.0
        with:
          version: 10

      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020  # v4.4.0
        with:
          node-version-file: .nvmrc
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build static export
        run: pnpm build

      - name: Verify static export
        # Mirrors the static-export invariants test (piece 7) — fail fast
        # if a Server Component or Server Action slipped past.
        run: |
          test -d out
          ! test -d out/_next/server
          ! grep -rl '"use server"' out || (echo "Server Actions in static export" && exit 1)

      - name: Template staticwebapp.config.json
        run: node scripts/swa-config.mjs

      - name: Azure login (OIDC)
        uses: azure/login@a457da9ea143d694b1b9c7c869ebb04ebe844ef5  # v2.3.0
        with:
          client-id: ${{ vars.AZURE_CLIENT_ID }}
          tenant-id: ${{ vars.AZURE_TENANT_ID }}
          subscription-id: ${{ vars.AZURE_SUBSCRIPTION_ID }}

      - name: Fetch SWA deployment token
        id: token
        run: |
          TOKEN=$(az staticwebapp secrets list \
            --name "${{ inputs.swa_name }}" \
            --resource-group "${{ vars.AZURE_RESOURCE_GROUP }}" \
            --query 'properties.apiKey' -o tsv)
          echo "::add-mask::$TOKEN"
          echo "token=$TOKEN" >> "$GITHUB_OUTPUT"

      - name: Deploy to Static Web Apps
        uses: Azure/static-web-apps-deploy@v1
        with:
          azure_static_web_apps_api_token: ${{ steps.token.outputs.token }}
          action: upload
          app_location: out
          skip_app_build: true
          skip_api_build: true

      - name: Smoke test
        run: |
          APP_URL="https://${{ inputs.swa_name }}.azurestaticapps.net"
          STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$APP_URL/")
          if [[ "$STATUS" != "200" ]]; then
            echo "Smoke test failed: / returned HTTP $STATUS"
            exit 1
          fi
          echo "Smoke test passed (HTTP $STATUS)"
```

Pins, OIDC login, environment-scoped variables, and the smoke-test
pattern all match `deploy-server.yml`. The deployment token is fetched
at workflow time rather than stored as a long-lived secret — same posture
the server workflow uses for everything via OIDC.

### 5. `.github/workflows/ci.yml` — add a static-export check

Extend the existing `unit` (or `build`) job to run the same
"no `_next/server`, no `"use server"`" assertions after `pnpm build`.
Cheap, catches regressions before they reach the deploy workflow.

### 6. `tasks/runbooks/client-deploy.md`

Operator runbook, sibling to `tasks/runbooks/server-deploy.md`.
Sections: prereqs (Azure CLI login, SWA name, RG, environment-scoped
`NEXT_PUBLIC_WRAP_API_URL`), steps (trigger workflow → confirm smoke
test → manual dashboard open), and rollback (re-run with a previous
ref via `workflow_dispatch`).

### 7. Extend `test/unit/tauri-invariants.test.ts` (rename to `static-export-invariants.test.ts`)

Spec 40 already shipped `test/unit/tauri-invariants.test.ts` to lock in
the no-shell-divergence contract for the Tauri target. After this spec,
the same `out/` powers both web and Tauri, so the contract is universal
— rename the file to `static-export-invariants.test.ts` and extend the
assertions to cover the web path:

- Existing checks stay (no static `@tauri-apps/api/*` imports under
  `src/`, `endpoint.ts` throws when `NEXT_PUBLIC_WRAP_API_URL` is unset).
- Update the `next.config.mjs` regex check: instead of asserting the
  `TAURI=1` → `output: 'export'` mapping, assert that `output: 'export'`
  is set unconditionally.
- Add: after `pnpm build`, `out/_next/server` does not exist.
- Add: no file under `out/` contains the string `"use server"`.

The post-build assertions run against a cached `out/` if present and
no-op if absent — the CI workflow runs the full build and re-runs the
test, so a missing `out/` in local `pnpm test` doesn't fail. Update
the file's header comment to reflect the universal contract and
cross-reference both spec 40 and spec 15.

### 8. Docs

- `README.md` — add a "Hosting (web)" section after "Setup".
  Three subsections: prereqs, deploy workflow trigger, and the
  env-var contract (`NEXT_PUBLIC_WRAP_API_URL`,
  `AZURE_RESOURCE_GROUP`, the per-environment SWA name).
- `ARCHITECTURE.md` — extend the "Two independently deployed packages"
  paragraph to name SWA as the client deploy target alongside the
  Function App.
- `CLAUDE.md` — add `staticwebapp.config.json` to the file map and
  note that the static-export contract is now universal (no `TAURI=1`
  carve-out in `next.config.mjs`).

## Rabbit holes

- **Don't switch to App Service / Container Apps / `output: 'standalone'`**
  to "keep the SSR option open". The client is local-first — encrypted
  IndexedDB, browser-side AI wrappers that forward to `server/`. There
  is no server work for Next to do, and standalone adds a Node runtime
  to the deploy surface for zero benefit. If a future feature genuinely
  needs SSR (e.g. shareable wraps with social-card metadata — see spec
  31), that's its own deploy decision; we can run a small App Service
  for that one route alongside SWA without changing this spec.

- **Don't use SWA's "linked backend" / managed-functions feature.** It
  proxies `/api/*` from the SWA hostname into the Function App and
  papers over CORS, but it changes the auth model: SWA expects to mint
  its own EasyAuth identity that the Functions runtime reads from
  `x-ms-client-principal`. We already mint per-install JWTs in
  `server/src/auth/jwt.ts` and verify them in `middleware.ts`. Layering
  EasyAuth on top is a footgun. Direct CORS to the Function App keeps
  one auth path.

- **Don't enable SWA authentication providers** (GitHub / Microsoft /
  Twitter / Apple). The per-install JWT is the auth model; SWA's
  built-in identity is irrelevant. Leave the `auth` block out of
  `staticwebapp.config.json`.

- **Don't bake the API URL into `src/lib/ai/endpoint.ts` as a fallback.**
  `endpoint.ts` already throws when `NEXT_PUBLIC_WRAP_API_URL` is unset
  — that's the right behaviour. Failing at build time (because the env
  var wasn't injected) is much better than shipping a bundle that
  silently calls the wrong origin.

- **Don't let the SWA action build the app.** `Azure/static-web-apps-deploy@v1`
  detects Next.js in the repo and tries to run its own build, which
  doesn't honour our env-var injection or our `staticwebapp.config.json`
  templating. Always pass `skip_app_build: true` and `skip_api_build:
  true`; we pre-build in the workflow.

- **Don't allow `connect-src *` in `staticwebapp.config.json`** to make
  CSP debugging easier in production. Same rationale as the Tauri shell
  (spec 40): a wildcard CSP in a deployed bundle is worse than no CSP
  because it's misleading. Template the actual origin.

- **Don't add the SWA as a CDN endpoint behind Front Door.** SWA already
  fronts content via its own global CDN. Layering Front Door buys
  nothing here and adds a routing surface. Defer until there's a
  concrete need (custom domain with WAF rules, multi-region failover,
  etc.).

- **Don't try to share the SWA artifact with the Tauri bundle.** Both
  build from the same `out/`, but the deploy paths diverge — Tauri
  needs icons, capabilities, and the Rust bundler; SWA just uploads
  the directory. The shared invariant is the contents of `out/`,
  enforced by the static-export test.

- **Don't ship `.env.local` into the artifact.** `NEXT_PUBLIC_*` vars
  are inlined into the JS bundle at build time, so the deployed `out/`
  is already self-contained. The deploy workflow doesn't need
  `.env.local` to exist on the runner — it sets `NEXT_PUBLIC_WRAP_API_URL`
  via job env.

## No-gos

- App Service / Container Apps / `output: 'standalone'`. Separate
  decision tied to a real SSR need.
- SWA EasyAuth / built-in auth providers.
- SWA managed-functions / linked-backend proxy. Direct CORS only.
- Custom domain + TLS certificate. v1 uses `*.azurestaticapps.net`.
- Front Door / CDN-in-front. SWA includes a CDN.
- Auto-deploy on merge-to-main. `workflow_dispatch` only — same posture
  as `deploy-server.yml`.
- A second SWA region for failover.
- Telemetry / RUM scripts injected into the bundle. Out of scope.
- Cookies, analytics, or any third-party origin in `connect-src`.
- Reintroducing a `src/app/api/` route to be served by SWA. The
  privacy invariant test still asserts it stays absent.
- Touching `server/` source. CORS is the only server-side change, and
  it's done through the `wrap_allowed_origins` Terraform variable, not
  code.

## Verification

- **`pnpm build`** produces `out/` with no `_next/server` directory and
  no file containing `"use server"`. (Asserted by piece 7's extended
  invariants test and re-asserted by the deploy workflow's "Verify
  static export" step.)
- **`pnpm test`** — the renamed `static-export-invariants.test.ts` is
  green; existing privacy invariants still hold; `src/app/api/` still
  absent.
- **`pnpm exec serve out`** locally renders the dashboard correctly
  when `NEXT_PUBLIC_WRAP_API_URL=http://localhost:7071/api` was set at
  build time and `func start` is running.
- **`terraform plan`** (in a fresh checkout against a clean state)
  shows one new `azurerm_static_web_app` resource per environment and
  the SWA hostname appearing in the Function App's `allowed_origins`.
- **`terraform apply`** in staging creates the SWA and exposes
  `static_web_app_default_host_name` + `static_web_app_deployment_token`
  via `terraform output`.
- **Deploy workflow run** against staging completes green: build →
  template config → SWA upload → smoke test (HTTP 200 on `/`).
- **Manual end-to-end against staging**: open
  `https://<swa-name>.azurestaticapps.net`, set a passphrase, import
  demo data, generate a wrap. Network tab shows requests to the
  deployed Function App with no CORS errors. The CSP header on the
  response includes the Function App origin in `connect-src` and no
  other third-party origins.
- **CSP rejection check**: open devtools, paste a `fetch('https://api.anthropic.com/...')`
  into the console, confirm it's CSP-blocked. The browser client must
  not be able to call any LLM provider directly — same invariant as
  the Tauri shell.
- **Rollback path**: re-run the deploy workflow against the previous
  commit ref; the SWA serves the older bundle within ~1 minute.

## Notes

- Touches: `next.config.mjs`, `package.json` (repoint `start` to
  `serve out` or remove), `staticwebapp.config.json` (new),
  `scripts/swa-config.mjs` (new),
  `infra/modules/static_web_app/{main,variables,outputs}.tf` (new),
  `infra/main.tf` (wire module + extend CORS), `infra/variables.tf`
  (add `swa_location`), `infra/outputs.tf` (expose SWA host + token),
  `.github/workflows/deploy-client.yml` (new),
  `.github/workflows/ci.yml` (extend with static-export check),
  `tasks/runbooks/client-deploy.md` (new),
  `test/unit/tauri-invariants.test.ts` (rename to
  `static-export-invariants.test.ts` and extend),
  `README.md` (add "Hosting (web)" section),
  `ARCHITECTURE.md` (name SWA as client target),
  `CLAUDE.md` (file map + universal export contract).
- Builds on **spec 14** (server deploy artifact, done 2026-05-11):
  without that spec the Function App has no code to receive
  CORS-allowed requests.
- Builds on **spec 40** (Tauri shell bootstrap, done 2026-05-23):
  spec 40 proved `out/` is a clean static export and added the
  invariants test this spec extends. Flipping the conditional in
  `next.config.mjs` to unconditional is safe because spec 40's Tauri
  build only ever relied on the static-export output mode being on —
  the `TAURI=1` env var remains live for `scripts/tauri-csp.mjs` and
  the Rust bundler, just no longer toggles `output: 'export'`.
- The `NEXT_PUBLIC_WRAP_API_URL` for each environment lives as a
  GitHub environment-scoped variable (matches the existing
  `vars.AZURE_RESOURCE_GROUP` pattern in `deploy-server.yml`). Set
  `staging` and `production` environments in the repo settings before
  running the workflow for the first time.
- Cost: SWA Standard is roughly $9/month/environment in `westeurope`
  (May 2026). Free tier doesn't support `staticwebapp.config.json`
  global headers, which is why we need Standard.
- Follow-up specs this enables (do not implement here):
  - Custom domain on the production SWA (DNS + managed certificate).
  - Automated deploy-on-tag (mirror a future server tag-based deploy
    workflow).
  - A `/healthz` or build-info endpoint baked into the static export so
    the smoke test can verify the deployed commit SHA matches.
  - Shareable highlight wheels (spec 31) — re-evaluates whether SWA
    suffices or whether an SSR surface is needed for OG/Twitter card
    metadata.
