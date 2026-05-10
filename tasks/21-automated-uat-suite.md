# Spec 21 — Automated UAT suite (Playwright)

**Status**: Shaped — ready to pick up
**Branch**: both (client test files + CI workflow)
**Appetite**: medium (≤ 3 days)
**Last shaped**: 2026-05-10

## Problem

`uat-plan.md` at the repo root documents 21 user-acceptance test cases
covering every user-facing flow plus the four privacy invariants. Today
those tests exist only as a written checklist: they require a human to
navigate the app, open DevTools, and eyeball IndexedDB. That means:

- Flows go untested between the time a PR merges and the time someone
  manually runs through the checklist.
- Known gaps (KG-1 through KG-11) are prose notes that don't
  automatically fail when a bug is fixed — a fixer might not notice the
  UAT entry exists.
- The CI `e2e` job runs four narrow Playwright specs (locality,
  encryption, network-minimality, gitlab-provider) but covers none of
  the other 17 UAT cases (passphrase setup, demo seeding, wrap
  generation, wrap viewer, wrap list, model switching, provider tab,
  profile persistence, palette switcher, idle lock, etc.).

Outcome: regression risk is high every time CLAUDE.md or the UI changes.
The existing e2e suite is a thin privacy canary, not a full acceptance
gate.

## Solution shape

### Layer 1 — Playwright UAT specs

Add `test/e2e/uat/` as a dedicated directory. Playwright already runs
`test/e2e/**` via `playwright.config.ts`; these files will be picked up
by the existing config without a new binary or config file.

**Shared helpers — `test/e2e/uat/helpers.ts`**

Four functions used by every spec to avoid repeating setup:

```ts
// Clear all storage for a fresh page state.
export async function clearStorage(page: Page): Promise<void>

// Perform first-launch passphrase setup.
// Fills both inputs, submits, waits for dashboard to mount.
export async function setupPassphrase(page: Page, pass: string): Promise<void>

// Enter passphrase on the "Welcome back." unlock screen.
export async function unlockWithPassphrase(page: Page, pass: string): Promise<void>

// Click "Try with demo data", wait for the 134-count hero to render.
export async function seedDemoData(page: Page): Promise<void>

// Stub the Azure Functions backend so tests that trigger enqueue/poll
// do not require `func start`. Returns an array that accumulates every
// POST /wrap request body for assertion.
export async function stubBackend(
  page: Page,
  opts?: { pollStatus?: 'queued' | 'running' | 'complete' | 'failed' }
): Promise<{ wrapRequests: Array<Record<string, unknown>> }>
```

`stubBackend` uses `page.route()` (same pattern as the existing
`network-minimality.spec.ts`). It intercepts three URLs:
- `POST */auth/register` → `{token: 'test-token', expiresAt: now+3600}`.
- `POST */wrap` → `{jobId, status: 'queued', busy: false}`.
- `GET */wrap/*` → returns `opts.pollStatus` (default `'complete'`). On
  `complete`, returns a `sliceContent` array of 10 stub entries — one
  per slice key — so downstream assertions about the slice structure can
  be made without a real LLM call.
- `POST */classify` → `{signal: 'Test contribution', category: 'delivery', weight: 3}`.

The stub makes client-only UAT tests fast and offline-capable.

**Test files**

One file per UAT case group. Each file describes the group in a
`test.describe()` block. Cases that share identical setup steps use
`test.beforeEach()`.

| File | UAT cases |
|------|-----------|
| `01-passphrase-setup.spec.ts` | UAT-001 |
| `02-demo-seeding.spec.ts` | UAT-002 |
| `03-lock-unlock.spec.ts` | UAT-003 |
| `04-manual-entry.spec.ts` | UAT-004 + KG-1 regression signal |
| `05-wrap-generation.spec.ts` | UAT-005 + UAT-008 |
| `06-wrap-viewer.spec.ts` | UAT-006 + KG-3 regression signal |
| `07-wrap-list.spec.ts` | UAT-007 |
| `09-model-switching.spec.ts` | UAT-009 |
| `10-provider-settings.spec.ts` | UAT-010 |
| `11-profile-persistence.spec.ts` | UAT-011 |
| `12-palette-switcher.spec.ts` | UAT-012 |
| `13-idle-lock.spec.ts` | UAT-013 |
| `14-pending-key-loss.spec.ts` | UAT-014 + KG-5 regression signal |
| `15-slice-fallback.spec.ts` | UAT-015 |
| `16-stale-wrap-link.spec.ts` | UAT-016 |
| `17-network-minimality.spec.ts` | UAT-017 (extends existing; co-locates) |
| `18-server-silence.spec.ts` | UAT-018 (static checks) |
| `19-encryption-at-rest.spec.ts` | UAT-019 (extends existing; co-locates) |
| `20-locality.spec.ts` | UAT-020 (extends existing; co-locates) |
| `21-wrong-model.spec.ts` | UAT-021 |

Do NOT delete the existing `test/e2e/locality.spec.ts`,
`test/e2e/encryption.spec.ts`, or `test/e2e/network-minimality.spec.ts`
— they are referenced in the CI matrix separately. The UAT variants
extend their assertions but live in `test/e2e/uat/` alongside the
others.

Also, the existing specs have a stale selector: they wait for
`page.getByText(/total signals/i)` but the current dashboard text is
`contributions caught`. Fix the selectors in the existing specs **in the
same PR** rather than letting them rot further. This is a small
correction, not a scope creep — the existing CI spec is currently
silently skipping assertions because the selector never matches.

### Layer 2 — Known-gap regression signals

Add `test/e2e/uat/known-gaps.spec.ts` as a single file for all KG
regression signals. Each test uses `test.fail()` to assert that the
*broken* behaviour currently exists. When a known gap is fixed, `test.fail()`
causes the overall test to report "unexpectedly passed" (red in CI),
which signals the implementer to:
1. Remove the `test.fail()` call from this file.
2. Verify the corresponding UAT spec in `test/e2e/uat/` now has a
   properly passing test (or write one if the failing variant was the
   only coverage).

```ts
// Pattern for every known-gap test:
test.fail('KG-1: ManualInputForm calls /api/classify (wrong host)', async ({ page }) => {
  // set up state
  // attempt manual entry
  // assert the SUCCESS outcome (green banner)
  // test.fail() means: if this assertion PASSES the bug is fixed;
  // if it FAILS the bug still exists and the overall test passes.
});
```

Cover KG-1, KG-3, and KG-5 (the three with directly observable
browser-visible effects). The remaining KGs (KG-2, KG-6–KG-11) are
structural or backend-only; add a comment block in `known-gaps.spec.ts`
citing each one with the UAT case that covers it and the spec that
should fix it. No `test.fail()` block for those — they're documented,
not automated.

### Layer 3 — Two-tier execution model

**Client-only (always runs; no backend)**

All UAT tests default to using `stubBackend`. Tests that exercise the
polling cycle call `stubBackend({ pollStatus: 'complete' })` and
immediately see a completed wrap — no real worker, no Service Bus.

Running client-only:
```bash
pnpm test:e2e
# or, filtering to just the UAT directory:
pnpm playwright test test/e2e/uat
```

This is what the `e2e` CI job runs. It requires no Azure credentials,
no running `func` process, no `ANTHROPIC_API_KEY` in scope.

**Full-stack (opt-in; requires running backend)**

When `UAT_FULL=1` is set, tests that exercise the actual wrap pipeline
(enqueue + worker + poll + save) bypass `stubBackend` and hit
`NEXT_PUBLIC_WRAP_API_URL` for real. Tests check for `UAT_FULL` at
the top of their describe block:

```ts
test.describe('wrap generation — full stack', () => {
  test.skip(!process.env.UAT_FULL, 'set UAT_FULL=1 to run against a real backend');
  // ...
});
```

Running full-stack locally:
```bash
# Terminal 1 — start the backend
cd server && func start

# Terminal 2 — run the full UAT suite
UAT_FULL=1 pnpm playwright test test/e2e/uat
```

### Layer 4 — Package scripts

Add to the root `package.json` `scripts` section:

```json
"test:uat":      "playwright test test/e2e/uat",
"test:uat:full": "UAT_FULL=1 playwright test test/e2e/uat"
```

`test:e2e` (the existing script) continues to run all of `test/e2e/**`,
which now includes `test/e2e/uat/**` — so the existing CI `e2e` job
picks up the UAT suite automatically without a workflow change.

### Layer 5 — CI workflow additions

Two changes to `.github/workflows/ci.yml`:

**1. Report artifact for UAT**

The existing `e2e` job already uploads `playwright-report/` on failure.
Change the artifact name from `playwright-report` to
`playwright-report-e2e` and add a matching artifact for the screenshots.
(If the report name stays generic and another job also uploads
`playwright-report`, GitHub dedups by appending `-1`, `-2`, which
makes it hard to find the right one in a matrix.)

**2. Workflow-dispatch full-stack UAT job**

Add a new job `uat-full` alongside the existing `ai-live-smoke` job:

```yaml
uat-full:
  name: UAT full-stack (manual)
  if: github.event_name == 'workflow_dispatch'
  runs-on: ubuntu-latest
  timeout-minutes: 30
  env:
    UAT_FULL: '1'
    NEXT_PUBLIC_WRAP_API_URL: 'http://localhost:7071/api'
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
    WRAP_JWT_SECRET: ${{ secrets.WRAP_JWT_SECRET }}
    # Azure credentials for the Functions backend
    AZURE_TABLES_ENDPOINT: ${{ secrets.AZURE_TABLES_ENDPOINT }}
    AZURE_FOUNDRY_PROJECT_ENDPOINT: ${{ secrets.AZURE_FOUNDRY_PROJECT_ENDPOINT }}
    ServiceBusConnection: ${{ secrets.AZURE_SERVICE_BUS_CONNECTION_STRING }}
  steps:
    - uses: actions/checkout@v4
    - uses: pnpm/action-setup@v4
      with: { version: 10 }
    - uses: actions/setup-node@v4
      with: { node-version: 22, cache: pnpm }
    - name: Install dependencies
      run: pnpm install --frozen-lockfile && cd server && pnpm install --frozen-lockfile
    - name: Install Playwright browsers
      run: pnpm test:e2e:install
    - name: Start backend
      run: cd server && pnpm exec func start &
      # Give the Functions host 20s to register all routes
    - name: Wait for backend
      run: |
        for i in $(seq 1 10); do
          curl -sf http://localhost:7071/api/health 2>/dev/null && break
          sleep 2
        done
    - name: Run UAT full-stack
      run: pnpm test:uat:full
    - name: Upload report
      if: always()
      uses: actions/upload-artifact@v4
      with:
        name: playwright-report-uat-full
        path: playwright-report/
        retention-days: 7
```

Note: `server/` currently has no `health` endpoint. Add a trivial one
as part of this spec: a `GET /health` Function that returns
`{status:'ok'}` with no auth requirement — needed by the CI wait loop
and useful for production monitoring anyway. This is ~10 lines and in
scope.

## Rabbit holes

- **Don't create a separate `playwright.uat.config.ts`.** The existing
  config already has `testDir: './test/e2e'`; the `uat/` subdirectory is
  automatically included. An extra config means two sets of webServer
  config to keep in sync, two `playwright install` invocations, and two
  CI jobs that are hard to distinguish. One config, one directory tree.
- **Don't try to spin up the full Azure Functions stack in the CI
  `e2e` job.** Service Bus isn't available in a vanilla GitHub Actions
  runner without secrets and a long setup script. The `e2e` job must
  stay fast and credential-free. Full-stack is a manual `workflow_dispatch`
  job with proper secrets.
- **Don't mock the entire IndexedDB.** The tests open a real browser
  (Chromium via Playwright) which has a real IndexedDB implementation.
  Use `page.evaluate()` to inspect raw IDB rows as the existing
  `encryption.spec.ts` already does. Don't polyfill with fake-indexeddb
  in e2e context — that's for Vitest unit tests.
- **Don't use `test.step()` to break up long scenarios.** Playwright's
  `test.step()` is for tracing, not for structuring tests. Keep each
  `test()` small; share setup with `beforeEach()` and the helpers.
- **Don't snapshot UI screenshots as pass/fail criteria.** Screenshots
  as visual regression tests are brittle (font rendering, anti-aliasing
  vary by OS). Upload screenshots as artifacts for human review, not as
  assertions. The existing `screenshots.spec.ts` already does this
  correctly — follow its pattern.
- **Don't assert pixel-level layout.** Assert text content, ARIA roles,
  visible/hidden state, IndexedDB structure. Not CSS values.
- **Don't test the backend in isolation here.** `server/test/` already
  covers unit + integration for the server. The UAT suite tests the
  end-to-end path from browser to backend and back — don't duplicate
  unit tests.
- **Don't gate the regular CI `e2e` job on `UAT_FULL=1`.** The client-
  only tier must run on every PR with no credentials required, just like
  today's `e2e` job.

## No-gos

- Visual regression testing (pixel diffs, screenshot assertions in
  pass/fail). Out of scope; that's its own decision.
- Testing on browsers other than Chromium. The current config is
  Chromium-only; extending to Firefox/WebKit is a separate spec.
- Replacing `pnpm test:e2e` with `pnpm test:uat` in the CI `e2e` job.
  They should coexist: existing specs remain in `test/e2e/` and continue
  to run; UAT specs are under `test/e2e/uat/` and are included automatically.
- Automating the Tauri shell (`pnpm tauri:dev`) in UAT. That requires a
  macOS runner with Rust; out of scope.
- End-to-end wrap generation tests in the default CI tier (requires
  a real LLM key and Service Bus). Keep those in `uat-full`.
- Adding the `health` endpoint to the existing Azure infra (Terraform /
  App Service config changes). Just write the Function; the infra update
  is a separate concern.

## Verification

The spec is complete when all of the following hold:

**Client-only tier (no backend)**

- `pnpm test:e2e` runs clean on a developer machine with no `.env.local`
  and no `func start`. The UAT files in `test/e2e/uat/` are included.
- The CI `e2e` job (on a PR) runs the full `test/e2e/**` glob, including
  the UAT subdirectory, and reports green.
- The known-gaps file (`known-gaps.spec.ts`) has three `test.fail()`
  blocks — KG-1, KG-3, KG-5 — and each is marked "known failure" in
  the Playwright report (not red, not skipped).
- `pnpm playwright test test/e2e/uat --reporter=list` shows exactly 21
  describe blocks corresponding to UAT-001 through UAT-021.

**Known-gap regression signals**

- Artificially fix KG-1 (make `ManualInputForm` call `classify()` from
  `src/lib/ai/classify.ts`). Without removing `test.fail()`, Playwright
  reports the KG-1 block as "unexpectedly passed" and fails the suite.
  Confirms the regression signal works.
- Revert the fix. Suite goes green again. Remove `test.fail()` — suite
  fails because the assertion now fails without the wrapper.
- Restore `test.fail()`. Everything green. (This 3-step canary is a
  one-time local check; don't add it to CI.)

**Full-stack tier**

- With a working backend at `localhost:7071`, `pnpm test:uat:full` runs
  all 21 UAT cases. Wrap-generation tests that were skipped in
  client-only mode now execute against the real worker.
- The CI `uat-full` workflow completes on `workflow_dispatch` (or fails
  with a clear message if Azure secrets are not configured in the repo).

**Stale selector fix**

- `pnpm playwright test test/e2e/locality.spec.ts` passes (selector
  `getByText(/contributions caught/i)` is correct after the fix).
- Same for `test/e2e/encryption.spec.ts`.

**Health endpoint**

- `curl http://localhost:7071/api/health` returns
  `{"status":"ok"}` when `func start` is running.
- The CI `uat-full` wait loop exits within 20s.

## Notes

- `test/e2e/uat/helpers.ts` is the only file that contains
  `page.route()` calls for the backend stub. All specs import from there
  — no copy-paste of stub code across files.
- `stubBackend`'s `pollStatus: 'complete'` default returns a canned
  `sliceContent` array with all 10 slice keys and stub
  `headline`/`body` strings. This lets UAT-015 (slice structure check)
  pass without a real LLM call: the test asserts the structure of the
  returned `sliceContent` array on the `wraps` IDB row, not the content.
- UAT-004 (`04-manual-entry.spec.ts`) and its KG-1 known-gap test share
  setup. Structure them in the same file under two `describe` blocks:
  one using `test.fail()` (the KG regression signal), one asserting the
  broken outcome as a positive passing test ("error banner is shown").
  That way the spec documents *both* that the bug exists and what the
  correct fix looks like.
- The existing `test/e2e/screenshots.spec.ts` captures UI
  screenshots for artifact upload. No change needed there.
- Coordinates with **spec 1** (polling-data-loss) and **spec 13**
  (graceful-wrap-not-found): when those specs are implemented, the
  corresponding `test.fail()` blocks in `known-gaps.spec.ts` will flip
  to "unexpectedly passed," signalling the implementer to delete the
  known-gap block and confirm the corresponding spec test passes.
- Coordinates with the stale `total signals` selector fix: whoever picks
  up this spec should file a note in the PR description if the existing
  e2e tests are *currently* passing with the wrong selector (they might
  be silently passing because the `toBeVisible()` never throws when the
  element isn't found — check).
- `NEXT_PUBLIC_WRAP_API_URL` is already set in the existing
  `playwright.config.ts` `webServer.env`. No config change needed for
  the client-only tier.
- The `uat-full` CI job needs `ServiceBusConnection`. Today that value
  isn't in any example file. Add it to `server/local.settings.json.example`
  as part of this PR (`ServiceBusConnection = ""` with a comment pointing
  to Azure Portal → Service Bus → Shared Access Policies).
