# Runbook: CI-based deploys

Both shipping pipelines — server (Azure Functions) and client (Tauri macOS
shell) — run from GitHub Actions. This runbook covers how to trigger them,
what GitHub Actions configuration each one needs, how to promote a build,
and how to roll back.

For the manual `az` zip-deploy path (useful for hotfixes or when CI is
broken), see `server-deploy.md`. For manual local Tauri builds (release-
candidate testing, reproducing a CI failure), see `tauri-build.md`.

## Pipeline overview

| Pipeline | Workflow | Trigger | Output |
|---|---|---|---|
| Server | `.github/workflows/deploy-server.yml` | `workflow_dispatch` (pick environment + Function App name) | Zip-deployed to the named Azure Function App |
| Client | `.github/workflows/release.yml` | `push` of a `v*` tag, or `workflow_dispatch` with an existing tag | Draft GitHub release with universal `.dmg` + `.app.tar.gz` |

The two pipelines are independent — server and client ship on their own
cadences, and breaking one does not block the other.

## One-time GitHub Actions configuration

Configure these once per repository in
**Settings → Secrets and variables → Actions**.

### Variables (Variables tab — visible in workflow logs)

| Name | Used by | Notes |
|---|---|---|
| `AZURE_CLIENT_ID` | server | App registration client ID for OIDC federation |
| `AZURE_TENANT_ID` | server | Entra tenant ID |
| `AZURE_SUBSCRIPTION_ID` | server | Subscription containing the Function App |
| `AZURE_RESOURCE_GROUP` | server | Resource group containing the Function App |
| `NEXT_PUBLIC_WRAP_API_URL` | client | Backend origin baked into the bundled CSP and the JS bundle (e.g. `https://wrap-prod.azurewebsites.net/api`). **No fallback** — missing value fails the build. Public by design (Next inlines `NEXT_PUBLIC_*` into the bundle) so it lives as a variable, not a secret. |

### Secrets (Secrets tab — masked in workflow logs)

None of the deploy workflows currently require explicit secrets.
Azure auth uses OIDC federation (`azure/login@v2` with `id-token: write`)
via the `AZURE_*` variables above; the GitHub `${{ github.token }}` is
used to upload release assets and is provisioned automatically.

Some adjacent workflows do use secrets (`ANTHROPIC_API_KEY` for
`ai-live-smoke.yml`); those are listed in the workflow files
themselves. If you add a secret, list it here so this runbook stays
the single source of truth for what CI needs to function.

### Environments

The server workflow runs under a GitHub deployment environment named
after the input (`staging` or `production`). If you want required
reviewers, branch protection, or per-environment variable overrides
(e.g. a different `NEXT_PUBLIC_WRAP_API_URL` for staging), configure
them under **Settings → Environments**. Variables defined at the
environment level override repository-level variables of the same name
when the workflow runs in that environment.

## Server deploys

### Trigger

GitHub UI: **Actions → Deploy server → Run workflow**. Two inputs:
1. **environment** — `staging` or `production`. Drives which GitHub
   environment's protection rules + variable overrides apply.
2. **function_app_name** — the Azure Function App resource name (without
   `.azurewebsites.net`). Used both for the `az` deploy target and for
   the smoke-test URL.

The workflow runs on `ubuntu-latest`, builds the zip via
`pnpm -C server package`, logs into Azure via OIDC, deploys, and smoke
tests `/api/auth/register`.

### What gets deployed

The zip produced by `server/scripts/zip-artifact.mjs` — same artifact the
manual runbook (`server-deploy.md`) builds. The CI workflow does not
modify `package.json`, `host.json`, or any function metadata; it builds
exactly what your local `pnpm -C server package` would build at the same
commit.

The deploy target is whatever `function_app_name` you typed. There is no
implicit mapping from "production" the GitHub environment to a specific
Function App name — that's deliberate so you can spin up a new
environment without editing the workflow.

### Smoke test

The workflow asserts that `POST /api/auth/register` returns 200, 400, or
422 (200 = success, 400/422 = the function ran and rejected the empty
body, both of which prove the host registered the route). Anything else
fails the workflow before it marks the deploy successful.

### Rollback

Three options, in order of preference:

1. **Redeploy a previous commit via the workflow.** Re-run the workflow
   from the commit you want to roll back to (Actions → Deploy server →
   pick the previous successful run → "Re-run all jobs"). This is the
   only path that re-runs the smoke test.
2. **Manual zip swap.** If a previous artifact zip is still on disk
   somewhere (developer machine, prior workflow run's artifacts —
   workflow_run artifacts are retained for 30 days), follow
   `server-deploy.md` step 4 to redeploy that zip directly. Faster than
   #1 if CI is itself broken.
3. **`az functionapp deployment list` + `--rollback`.** Azure keeps
   prior deployments addressable; `az functionapp deployment list` shows
   IDs and `az functionapp deployment slot swap` (slot-based) or
   redeployment by ID can rewind. Use only if #1 and #2 are blocked.

After any rollback, run the same smoke test the workflow runs:

```bash
curl -s -o /dev/null -w "%{http_code}" \
  -X POST "https://<function-app>.azurewebsites.net/api/auth/register" \
  -H "Content-Type: application/json" -d '{}'
# Expect 200, 400, or 422.
```

## Client releases

### Trigger

Two paths, both produce the same artifacts:

1. **Tag push** (the steady-state path):
   ```bash
   git tag v0.1.0
   git push origin v0.1.0
   ```
   The workflow fires on `push: tags: 'v*'` and builds against the
   tag's commit.
2. **`workflow_dispatch`** with an `tag` input. Useful for re-running a
   release against an already-existing tag (e.g. CI was flaky and the
   first run failed before uploading artifacts).

The workflow runs on `macos-14` (Apple Silicon), installs both
`aarch64-apple-darwin` and `x86_64-apple-darwin` Rust targets, and runs
`pnpm tauri build --target universal-apple-darwin`.

### Pre-flight check

Before the build runs, the workflow verifies `NEXT_PUBLIC_WRAP_API_URL`
is set and not `*`, and echoes the parsed origin to the log. If it's
unset, the workflow fails with a pointer to the GitHub Settings page —
this is intentional, since a release artifact baked against localhost
would be a broken app in someone's `/Applications`.

### What gets produced

Under `src-tauri/target/universal-apple-darwin/release/bundle/`:
- `dmg/Wrapped for Work_<version>_universal.dmg` — drag-to-install
- `macos/Wrapped for Work.app.tar.gz` — tarred `.app` (forward-compat
  shape for spec 41's auto-updater)

Both are uploaded to:
- A **draft GitHub release** named after the tag (created on demand;
  re-runs use `--clobber` to overwrite).
- A **workflow run artifact** named `tauri-bundle-<tag>` with 30-day
  retention (backstop in case the release upload step needs to be
  re-run).

### Promoting a draft to "latest"

The workflow always creates the release as a **draft**. Promotion is a
deliberate human step:

1. GitHub UI: **Releases → pick the draft → Edit → uncheck "Set as a
   pre-release" if needed → check "Set as the latest release" → Publish
   release**.
2. Or via API/CLI from a machine that has `gh`:
   ```bash
   gh release edit v0.1.0 --draft=false --latest
   ```

Spec 41's auto-updater will follow the
`releases/latest/download/update-manifest.json` URL, so promoting a
release is what causes the existing install base to pick it up. **Do
not promote a release you haven't installed and smoke-tested yourself.**

### First-launch UX

The artifacts are unsigned (no Apple Developer ID yet). Recipients
either right-click → Open the first time, or strip the quarantine bit:

```bash
xattr -dr com.apple.quarantine "/Applications/Wrapped for Work.app"
```

This is called out in the auto-generated release notes the workflow
creates. Notarisation is a separate follow-up spec.

### Rollback

There is no "undo" for an installed `.app`; rollback means making sure
new installs pick up the previous version and existing installs aren't
prompted to upgrade.

1. **Unpublish the bad release**: GitHub UI → Releases → bad release →
   Edit → check "Set as a pre-release" or convert back to draft, and
   uncheck "Set as the latest release". The previous non-prerelease
   release automatically becomes "latest" again.
2. **For installs that already applied the bad update** (only relevant
   once spec 41's updater is shipped): publish a new release at a
   higher version number containing the rollback. The updater only
   moves forward.
3. **Delete the bad tag** only if you want to stop people building from
   it locally. Doesn't affect anyone who's already installed.

## Troubleshooting

| Symptom | Where to look |
|---|---|
| Server workflow: Azure login step fails | `AZURE_CLIENT_ID` / `AZURE_TENANT_ID` / `AZURE_SUBSCRIPTION_ID` not set, or the federated credential on the app registration doesn't allow this repo/branch. Check **App registration → Federated credentials** in Entra. |
| Server workflow: `az functionapp deployment` fails with 404 | `function_app_name` typo, or the Function App isn't in `AZURE_RESOURCE_GROUP`. Run `az functionapp list -g $RG -o table` from a logged-in shell. |
| Server workflow: smoke test fails with 500 | Deploy succeeded but the host can't start — usually `ENV_MODE` or a Key Vault reference. Follow `server-deploy.md`'s troubleshooting table. |
| Client workflow: `NEXT_PUBLIC_WRAP_API_URL is not set` | The repository variable isn't configured. Settings → Secrets and variables → Actions → Variables → New repository variable. |
| Client workflow: Rust target install fails | macos-14 image rotation. Re-run; if it persists, pin the runner to a specific image version. |
| Client workflow: `tauri build` fails on icon bundling | The placeholder `.icns` shipped with spec 40 didn't pass the bundler. Regenerate via `pnpm tauri icon icons/icon.png` (needs a real icon source) and commit. |
| Client workflow: release upload fails with 403 | `permissions.contents: write` missing from the workflow, or the default `GITHUB_TOKEN` is restricted at the repo level (Settings → Actions → General → Workflow permissions). |
| "I promoted the wrong release" | Edit the release, uncheck "Set as the latest release", and re-promote the correct one. The previous non-prerelease release becomes "latest" automatically. |
| Tag push didn't trigger the workflow | The workflow only triggers on tags matching `v*`. Confirm the tag is on a commit that's pushed to GitHub (`git push origin <tag>`, not just `git tag` locally). |
