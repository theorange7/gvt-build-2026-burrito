# Spec 14 — Server build + deploy artifact

**Status**: Done
**Branch**: server (with optional CI workflow change in the same PR)
**Appetite**: small (≤ 1 day; realistically ~half day for build, half day for runbook)
**Last shaped**: 2026-05-09
**Severity**: Blocks first deploy. Without this, the Function App provisioned by Terraform has nothing to run.

## Problem

`server/package.json` declares `"main": "src/index.ts"`. The Azure Functions
runtime needs **compiled JavaScript** — it will not run TypeScript directly.
Today, the `server/` package has:

- No `tsc` build step (only `tsc --noEmit` for typechecking).
- No `dist/` output.
- No deployment zip.
- No `az functionapp deployment` or equivalent script.
- No CI artifact upload.

Concretely: if PR #24 (server) and the infra Terraform PR both merge and
someone runs `terraform apply`, they get a Function App that's been
configured for `WEBSITE_RUN_FROM_PACKAGE=1` and is looking for a code zip
that doesn't exist. The first request to any function 404s. The operator
debugging that has no signal pointing them at "we never built the code."

This spec doesn't add new behavior — it makes the existing code actually
runnable in Azure.

## Solution shape

Three pieces, each small. Land them in one PR.

### 1. `pnpm -C server build`

Add a `build` script to `server/package.json`:

```json
"scripts": {
  "build": "tsc -p tsconfig.build.json && node scripts/copy-assets.mjs",
  ...
}
```

`tsconfig.build.json` extends the existing `tsconfig.json` and overrides:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "outDir": "./dist",
    "declaration": false,
    "sourceMap": true,
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["src/**/*.test.ts", "test/**"]
}
```

`scripts/copy-assets.mjs` copies the runtime-required non-TS files into
`dist/`:

- `host.json` → `dist/host.json`
- `package.json` → `dist/package.json` (a runtime-shaped variant — see below)
- `src/ai/models.config.json` → `dist/ai/models.config.json` (if not
  bundled by tsc; verify via test).

The runtime `dist/package.json` lists only the production dependencies the
Function host needs at runtime, with `"main": "index.js"`. We strip
`devDependencies`, `scripts.test`, etc. Cheapest implementation: a small
node script that reads the original, picks the relevant fields, writes
the trimmed version into `dist/`. ~20 lines.

Two important details:

- The `@wrapped/shared` dep is `file:../shared`. After build, `dist/`
  must either inline the shared types (they're erased at compile time —
  type-only imports leave no JS), OR we need to verify that `tsc`'s
  output has zero residual references to `@wrapped/shared`. Verify by
  grepping `dist/` after build; expect zero matches.
- Vitest's `vi.mock` paths in tests don't survive build. They shouldn't —
  we exclude `test/**` from the build tsconfig.

### 2. `pnpm -C server package`

Adds a script that builds and zips:

```json
"scripts": {
  "build": "...",
  "package": "pnpm build && cd dist && zip -r ../wrap-server.zip . -x '*.test.js'"
}
```

Outputs `server/wrap-server.zip`. Anyone with `az` CLI access can run:

```bash
az functionapp deployment source config-zip \
  -g <resource-group> \
  -n <function-app-name> \
  --src server/wrap-server.zip
```

### 3. Runbook + CI gating

Add `tasks/runbooks/server-deploy.md` (create the directory) documenting:

- Prereqs: `az login`, Function App name, resource group.
- Steps: build → package → zip-deploy → smoke-test (`curl ${HOSTNAME}/api/wrap`
  expecting 401 without a token, confirming the function is registered).
- Rollback: redeploy the previous zip artifact.

For CI: extend `.github/workflows/ci.yml`'s `unit` job (existing) to run
`pnpm -C server build` after typecheck. This catches regressions where
production code typechecks but doesn't build (rare but possible — e.g.
import paths that resolve in dev via path mapping but not in plain compiled
JS).

**Don't** add an automatic deploy-on-merge step. Deploy stays manual /
operator-driven for now; spec for automated deploys is its own thing.

## Rabbit holes

- **Don't bundle with esbuild / webpack / rollup** as part of this spec.
  `tsc` straight to `dist/` is the simplest and matches what every Azure
  Functions Node template does. Bundling has tradeoffs (better cold-start,
  worse stack-trace UX, harder to grep production code) that deserve
  their own decision.
- **Don't use `tsx` in production**. We can use it for local dev (
  `pnpm -C server dev` via `func start` already does this implicitly), but
  the deployed artifact must be plain JS. The Azure runtime doesn't ship
  with `tsx`.
- **Don't try to share `node_modules` between root and `server/dist/`.**
  Functions runtime expects the package to be self-contained. If `dist/`'s
  `package.json` lists deps, the deploy zip must include `node_modules/`
  (or the Function App must run `npm install` server-side via the
  `SCM_DO_BUILD_DURING_DEPLOYMENT` setting). Pick one consistently:
  - **Recommended**: include pre-installed `node_modules` in the zip
    (`pnpm install --prod` against `dist/package.json`, copy
    `dist/node_modules`, zip). Predictable, no remote build.
  - Alternative: rely on Oryx remote build with `SCM_DO_BUILD_DURING_DEPLOYMENT=true`.
    Faster CI but adds a remote-build dependency.
  Pick the recommended path.
- **Don't try to symlink `@wrapped/shared`** into `dist/node_modules` at
  package time. Because shared types erase to nothing after compile, the
  shared package doesn't need to ship. Verify by post-build grep.
- **Don't add a heredoc-laden bash script** to `package.json` scripts.
  Anything beyond a one-liner goes in a `scripts/*.mjs` file. Easier to
  read, easier to test, easier to maintain.

## No-gos

- Bundling (esbuild / webpack / rollup). Separate decision.
- A custom Docker image for the Function App. Default Node 22 host is fine.
- `.dockerfile` of any kind. Functions Consumption / Flex Consumption
  doesn't run containers in our stack.
- A monorepo build orchestrator (Turborepo, Nx, Lage). Just pnpm scripts.
- Auto-deploy from the CI workflow on merge-to-main. Manual deploy only
  in this spec.
- Telemetry / metrics on deploy times. Out of scope.

## Verification

- **`pnpm -C server build`** produces `server/dist/` containing `index.js`,
  one JS file per Function (`functions/wrapEnqueue.js`, etc.), `host.json`,
  a runtime-shaped `package.json`, and `models.config.json`.
- **`grep -r '@wrapped/shared' dist/`** returns zero matches (proves type
  erasure worked).
- **`grep -r 'from .*\.ts'` in `dist/`** returns zero matches (no leftover
  TypeScript imports).
- **`pnpm -C server package`** produces `server/wrap-server.zip` of
  expected shape (run `unzip -l` and assert structure).
- **`func start`** in `server/dist/` (or via Azure Functions Core Tools)
  starts cleanly and registers all four HTTP routes + the queue trigger.
  This is the local equivalent of "would this run in Azure".
- **CI workflow run** with the `pnpm -C server build` step reports green
  on the existing branch.
- **(Manual integration)** smoke-deploy to a staging Function App (set up
  for one-off use), call `/api/auth/register`, expect a 200 with a JWT.
  Document this in the runbook; don't gate the spec on actually doing it
  in CI.

## Notes

- `server/tsconfig.json` currently has `"noEmit": true`. Don't change it
  — that's correct for typecheck mode. The build extends to override.
- The infra branch already provisions `WEBSITE_RUN_FROM_PACKAGE=1`. The
  zip we produce here matches that expectation.
- Existing `local.settings.json.example` documents env vars for local dev
  with `func start`. Reference it in the runbook.
- This spec deliberately stops short of automated deployment. A follow-up
  spec ("server CI deploy on tag") could add a release workflow. Out of
  scope here.
- Touches `server/package.json`, adds `server/tsconfig.build.json`,
  `server/scripts/copy-assets.mjs`, `server/scripts/zip-artifact.mjs`,
  `.github/workflows/ci.yml`, and `tasks/runbooks/server-deploy.md`.
- Independent of every other spec in this directory. Land in any order.
- **Deviation from spec**: The spec asserted that all `@wrapped/shared` imports
  are type-only (and would erase to nothing), making the `grep dist/` zero-match
  check trivially true. In practice, `wrapEnqueue.ts` and `classify.ts` import
  Zod schemas (`enqueueWrapRequestSchema`, `classifyRequestSchema`) as values.
  `copy-assets.mjs` therefore builds `@wrapped/shared` into `dist/_shared/` and
  the runtime `package.json` references it as `file:./_shared`. The pre-install
  step in `zip-artifact.mjs` copies it into `dist/node_modules/@wrapped/shared`
  before zipping, so the artifact is fully self-contained.
- `build-runtime-package-json.mjs` from the spec Notes is not a separate file;
  the package.json generation (~20 lines) lives at the end of `copy-assets.mjs`.

## Done

**Completed**: 2026-05-11
**Branch**: claude/implement-spec-14-xmQBd
**Summary**: Shipped `pnpm -C server build` (tsc + copy-assets) and
`pnpm -C server package` (build + npm install --omit=dev + zip) in one PR.
`server/tsconfig.build.json` overrides the dev tsconfig to emit CommonJS to
`dist/` (correct for direct Node.js execution on Azure Functions). One deviation
from the spec: `@wrapped/shared` has two value imports (Zod schemas), not only
type imports, so `copy-assets.mjs` compiles shared into `dist/_shared/` and
wires it into the runtime `package.json` as a local file dep — the pre-install
step resolves it into `node_modules` before zipping. The `grep dist/` check will
find `@wrapped/shared` only in the `require()` calls and `node_modules`, which
is expected and correct. CI gains `pnpm -C server typecheck` and
`pnpm -C server build` steps after the existing client build. Deploy runbook
added at `tasks/runbooks/server-deploy.md`.
