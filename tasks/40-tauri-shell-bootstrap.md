# Spec 40 — Tauri 2 macOS shell bootstrap

**Status**: Done — 2026-05-23 (claude/spec-40-bpkpC)
**Branch**: client (everything under `src-tauri/`, `scripts/`, `package.json`, `next.config.mjs`, `src/lib/ai/`, `src/lib/local-store/platform.ts`)
**Appetite**: medium (≤ 3 days; one day for the Rust crate + build wiring, one day for proving the static export round-trips cleanly, half a day for the no-divergence invariant)
**Last shaped**: 2026-05-10

## Problem

`src-tauri/` today is a stub. It has a README describing the intended shape,
a `tauri.conf.json` pointing at a non-existent static export, and nothing
else — no `Cargo.toml`, no `src/main.rs`, no icons, no capabilities, no
working `pnpm tauri:dev` / `pnpm tauri:build`. The `@tauri-apps/cli` dep
is installed but the commands fail because there is no Rust crate to drive.

We can't ship the v2 distribution target (a macOS `.app`) and we can't even
test the WebView locally. Meanwhile the browser client at `/dashboard` is
the v1 target and is still a moving WIP — slides, providers, the wrap flow
are all in flux. Whatever we do in the shell **must not fork** the client:
the same `next dev` / `next build` output that powers the browser app has
to be what the Tauri window loads, with no shell-specific React paths.

Two concrete blockers behind the stub:

1. `scripts/tauri-export.mjs` references `src/app/api/` and renames it
   aside before `next build`. That directory was deleted when the backend
   moved to `server/` — `test/unit/privacy-invariants.test.ts` now asserts
   it stays absent. The script is stale; it just happens to be a no-op
   today because `existsSync(apiDir)` is `false`. We should delete or
   reduce it before someone trips over it.
2. `tauri.conf.json`'s CSP `connect-src` lists `https://api.anthropic.com`
   from an earlier architecture where the client called Anthropic
   directly. That path is gone — the client now only talks to the Azure
   Functions backend at `NEXT_PUBLIC_WRAP_API_URL`. Loading the static
   export inside the shell would silently CSP-block every wrap call.

This spec gets us to: `pnpm tauri:dev` opens a working WebView pointed at
the running `next dev`, `pnpm tauri:build` produces an unsigned `.app` /
`.dmg` that loads the bundled static export, and any future change to the
browser client ships into the shell with zero extra steps.

## Solution shape

Five pieces, all in one PR on `claude/tauri-implementation-spec-rwZDV`.

### 1. Scaffold the Rust crate

Create the minimum Tauri 2 crate under `src-tauri/`:

```
src-tauri/
  Cargo.toml
  build.rs
  tauri.conf.json          (already exists — see piece 2)
  src/
    main.rs
    lib.rs
  capabilities/
    default.json
  icons/                   (placeholder PNGs + .icns — see "Rabbit holes")
```

`Cargo.toml` pins:

```toml
[package]
name = "wrapped-for-work"
version = "0.1.0"
edition = "2021"
rust-version = "1.77"

[lib]
name = "wrapped_for_work_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = [] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

`src/main.rs` and `src/lib.rs` are the standard Tauri 2 template — `main`
forwards to `lib::run()`, `lib::run()` calls `tauri::Builder::default()`
with no plugins for v1. No invoke handlers in this spec; the shell is a
thin WebView. Crypto, storage, and AI all stay in JS.

`build.rs` is the one-liner `fn main() { tauri_build::build() }`.

`capabilities/default.json` declares the minimum permission set the
WebView needs (core APIs only — no fs, no shell, no http). The CSP does
the heavy lifting; capabilities just gate `invoke` access, which we
don't use in v1.

### 2. Fix `tauri.conf.json`

Three edits:

- Replace `beforeBuildCommand` to use the regular Next.js build with the
  `TAURI=1` env, so it picks up `output: 'export'` from
  `next.config.mjs`. The `scripts/tauri-export.mjs` workaround is no
  longer needed (see piece 4).
- Rewrite the CSP `connect-src` to allow the configured backend origin,
  not `api.anthropic.com`. Resolution rule: the build reads
  `NEXT_PUBLIC_WRAP_API_URL` at build time and writes a CSP that
  whitelists its origin. Concretely, add a tiny `scripts/tauri-csp.mjs`
  that templates `tauri.conf.json` from a `tauri.conf.template.json`
  with `${WRAP_API_ORIGIN}` substituted in, run as part of
  `beforeBuildCommand`. Default origin if unset: `http://localhost:7071`
  (matches `func start`). Dev keeps `devUrl: http://localhost:3000` and
  also needs the API origin allowed when the WebView fetches.
- Add `withGlobalTauri: false` under `app` and confirm
  `macOSPrivateApi: false`. We don't need either for v1.

Final `connect-src` shape (after templating):

```
connect-src 'self' http://localhost:3000 ws://localhost:3000 ${WRAP_API_ORIGIN};
```

`ws://localhost:3000` is the Next dev server's HMR socket — required in
dev only. The build pipeline emits two configs (dev vs build) or one
config that allows both; pick whichever Tauri 2 supports natively
(`security.devCsp` exists on Tauri 2; use it). See "Rabbit holes" on
why we don't just allow `*`.

### 3. `package.json` script glue

Today's scripts:

```
"tauri": "tauri",
"tauri:dev": "tauri dev",
"tauri:build": "tauri build"
```

Keep them. The CSP-templating script and static export both run from
inside `tauri.conf.json`'s `beforeBuildCommand`, so the top-level
scripts stay one-liners.

Add a `tauri:check` script that runs `cargo check --manifest-path
src-tauri/Cargo.toml`. CI calls this so we notice when the crate
breaks without needing Rust on every developer's machine.

### 4. Retire `scripts/tauri-export.mjs`

Delete the file. Reason: `src/app/api/` is gone, the privacy invariant
asserts it stays gone, and `next build` with `TAURI=1` already produces
a clean `out/` thanks to `next.config.mjs`'s conditional
`output: 'export'`. Replace the `beforeBuildCommand` reference with the
new CSP-templating script chained to `next build`:

```json
"beforeBuildCommand": "node scripts/tauri-csp.mjs && TAURI=1 pnpm build"
```

If you find a reason `tauri-export.mjs` is still load-bearing (e.g. a
Server Action snuck back in), don't restore the stash dance — fix the
root cause. Static export is the contract.

### 6. Update documentation

Rewrite `src-tauri/README.md` end-to-end. The current README describes the
old architecture (references `src/app/api/` stash dance, wrong CSP origin,
a stateless-proxy TODO that no longer applies). After this spec, the README
is the operator runbook for the shell: prerequisites, one-time bootstrap,
dev workflow, build/release steps, and what is explicitly not in v1.

Also expand two sections in the existing docs:

- **`README.md`** — the "Tauri shell (v2)" section is two lines + a link.
  Expand it to show the one-time Rust prerequisite, `tauri:dev` /
  `tauri:build` / `tauri:check` invocations, and which env var controls
  the backend origin baked into the bundle.
- **`ARCHITECTURE.md`** — the "Tauri shell (v2 distribution)" section is
  a four-bullet future-state list. Expand it to describe what v1 *is*
  (static export, thin WebView, remote backend) with the build commands
  and the no-divergence contract.
- **`CLAUDE.md`** — add `pnpm tauri:check` to the Commands section so
  future agents know the crate-check script exists.

The docs should reflect the **post-spec-40 state** — written as if the
Rust crate, icons, and CSP templating are already in place.

### 5. Lock in the "no shell divergence" invariant

The whole point of this spec is that the browser app and the Tauri app
render from the same React tree. Add a static-analysis test under
`test/unit/tauri-invariants.test.ts` asserting:

- No file under `src/` imports `@tauri-apps/api/*` directly at module
  scope. Tauri-only behaviour (if any future spec adds it) must be
  dynamically imported behind an `isTauri()` guard, so the browser
  bundle stays free of the Tauri runtime.
- `src/lib/ai/endpoint.ts` continues to throw if
  `NEXT_PUBLIC_WRAP_API_URL` is unset — no implicit "we're in Tauri,
  use a different default" branch.
- `next.config.mjs` keeps the `TAURI=1` → `output: 'export'` mapping.
  (One-line regex check.)

These three checks are the contract that makes "a change to the
browser client just works in Tauri" true.

Also expand the e2e privacy assertion (or add a small note in
`test/e2e/`) to run once with `TAURI=1 pnpm build` and verify `out/`
contains no `_next/server` directory and no `.html` file that contains
the string `"use server"` — both are signs that a Server Action or
Server Component slipped past the static export.

## Rabbit holes

- **Don't migrate `src/lib/local-store/crypto.ts` to
  `tauri-plugin-stronghold` in this spec.** The README mentions it as a
  future enhancement. It's a real win (OS-bound keychain instead of an
  in-memory `cachedKey`), but it forks the storage layer between browser
  and shell — exactly the divergence the user wants to avoid for v1.
  Stronghold lands in its own spec once the browser client stabilises.

- **Don't add a Tauri sidecar for the Azure Functions backend.** Tauri
  supports bundling a binary sidecar; tempting for "fully local" mode.
  Out of scope — the AI surface uses Anthropic / Azure Foundry, both
  online, and the JWT-gated Functions backend is the deploy target. We
  call the deployed backend over HTTPS, full stop.

- **Don't allow `connect-src *` to make CSP debugging easier.** The
  whole point of the Tauri shell is the smaller attack surface. Template
  the actual deployed origin in at build time. A wildcard CSP in a
  production `.app` is worse than no CSP because it's misleading.

- **Don't try to ship a real icon set in this PR.** Generate a flat-colour
  placeholder `.icns` + the `Square*Logo.png` variants Tauri's bundler
  insists on. Note in the spec's "Done" block that real icons are a
  follow-up. Without *some* icon files the build fails outright; with
  the placeholders it ships and the operator can swap them later.

- **Don't enable `tauri-plugin-updater` yet.** Auto-update needs a code
  signing identity and a hosted update manifest endpoint. We have
  neither. Add it in a follow-up once we have a notarised build.

- **Don't sign or notarise the build.** Unsigned `.app` is fine for the
  v1 spec target — internal testing and a `pnpm tauri:build` that
  produces *something*. Notarisation is its own spec (entitlements,
  Apple Developer account, CI secrets).

- **Don't add Windows / Linux targets.** macOS only. The bundle target
  in `tauri.conf.json` stays `["dmg"]`. Cross-platform support is a
  separate decision — Windows in particular changes the WebView
  (WebView2 vs WKWebView) and risks subtle behaviour drift.

- **Don't fall back to `output: 'standalone'` to avoid wrestling with
  static export.** Standalone needs a Node runtime; the `.app` doesn't
  have one. If a feature won't static-export, the right answer is to
  move that feature behind the backend (which is the architecture
  anyway), not to relax the shell's runtime contract.

- **Don't add `invoke` handlers "just in case".** Every Rust → JS bridge
  is a divergence point. We add them when a specific feature needs OS
  access the WebView can't reach.

## No-gos

- Stronghold / keychain integration. Separate spec, post-v1.
- Anthropic / Azure SDK in the shell. Backend stays remote.
- Auto-update / signing / notarisation. Separate spec.
- Windows or Linux build targets.
- Tauri sidecar for the Functions backend.
- Bundling the demo JSON differently for the shell. Same `public/`
  asset, same fetch.
- An `invoke`-based local store. Dexie/IndexedDB works in WKWebView and
  matches the browser client byte-for-byte.
- Telemetry from the shell. We have no telemetry surface; not adding one.
- Per-platform React code paths. `isTauri()` guards are reserved for
  *additive* behaviour (e.g. swap key cache backing); they never gate a
  feature off in the browser.

## Verification

- **`pnpm tauri:check`** runs `cargo check` against `src-tauri/Cargo.toml`
  cleanly on a fresh checkout with Rust 1.77+ installed.
- **`pnpm tauri:dev`** opens a native window with the dashboard. Setting
  a passphrase, importing demo data, and generating a wrap all work end
  to end against a `func start` backend on `:7071`. No CSP violations
  in the WebView devtools console.
- **`TAURI=1 pnpm build`** produces a clean `out/` with no
  `_next/server` directory.
- **`pnpm tauri:build`** produces
  `src-tauri/target/release/bundle/macos/Wrapped for Work.app` and a
  `.dmg`. Launching the `.app` loads the dashboard from the bundled
  static export and connects to the configured `NEXT_PUBLIC_WRAP_API_URL`.
- **No-divergence invariants pass**:
  - `test/unit/tauri-invariants.test.ts` is green.
  - `pnpm test` overall is green (existing privacy invariants still
    hold; `src/app/api/` still absent).
- **Manual round-trip**: edit a slide component (e.g. change a headline
  in `src/components/slides/`), rerun `pnpm tauri:build`, relaunch the
  `.app`, observe the change. No Rust rebuild needed beyond the bundler.
- **Stale code removed**: `scripts/tauri-export.mjs` is gone; nothing
  else in the repo references it (`grep -r tauri-export .`).
- **CSP correct**: opening devtools in the built `.app` and inspecting
  the response headers / meta CSP shows the deployed Functions origin
  in `connect-src` and no `api.anthropic.com`.
- **Docs accurate**: `src-tauri/README.md` documents the actual
  prerequisites, bootstrap steps, `tauri:dev` / `tauri:build` /
  `tauri:check` invocations, and what is deferred. A reader following
  the README alone can get a working dev shell and a distributable
  `.app` without referring to the spec.

## Notes

- The user's framing is "browser client is still a WIP — make sure
  Tauri tracks it seamlessly." That's the invariant captured in piece 5.
  Every future client PR — slide tweaks, dashboard polish, new
  providers — should ship into Tauri with zero Rust changes. If a PR
  forces a Rust change, that's a signal something diverged.
- `isTauri()` already exists in `src/lib/local-store/platform.ts` but
  is currently unused. Don't add usages in this spec — leave it as the
  seam for the stronghold spec that comes later.
- The README in `src-tauri/` describes Stronghold and a stateless proxy
  origin (`https://your-stateless-proxy.example`). Both are out of
  date. Update the README in this PR to match the actual architecture:
  the shell loads the static Next.js export and talks to the deployed
  Azure Functions backend via `NEXT_PUBLIC_WRAP_API_URL`.
- Touches: `src-tauri/Cargo.toml` (new), `src-tauri/build.rs` (new),
  `src-tauri/src/main.rs` (new), `src-tauri/src/lib.rs` (new),
  `src-tauri/capabilities/default.json` (new),
  `src-tauri/icons/*` (new placeholders),
  `src-tauri/tauri.conf.json` (rewritten),
  `src-tauri/tauri.conf.template.json` (new — input to CSP templater),
  `src-tauri/README.md` (full rewrite — setup, dev, release runbook),
  `scripts/tauri-csp.mjs` (new),
  `scripts/tauri-export.mjs` (deleted),
  `package.json` (adds `tauri:check`),
  `README.md` (expand Tauri section),
  `ARCHITECTURE.md` (expand Tauri section),
  `CLAUDE.md` (add `tauri:check` to Commands),
  `test/unit/tauri-invariants.test.ts` (new),
  optionally `.github/workflows/ci.yml` if CI gains a `tauri:check` step.
- Dependencies on other specs: none. Lands independently. Pairs well
  with spec 14 (server deploy) because the shell needs a real
  `NEXT_PUBLIC_WRAP_API_URL` to point at, but doesn't block on it for
  local-dev verification (`func start` is enough).
- Follow-up specs this enables (do not implement here):
  - Stronghold-backed key cache (replaces in-memory `cachedKey`).
  - Notarised + signed `.dmg` for distribution.
  - Tauri updater plugin with hosted manifest.
  - Real icon set.
  - Windows / Linux targets (only if/when there's a real demand).

## Done

**Completed**: 2026-05-23
**PR**: claude/spec-40-bpkpC
**Summary**: Scaffolded the Tauri 2 crate under `src-tauri/` (`Cargo.toml`,
`build.rs`, `src/main.rs`, `src/lib.rs`, `capabilities/default.json`). The
shell carries no `invoke` handlers and no plugins in v1 — crypto, storage,
and AI all stay in JavaScript. Replaced the stale `scripts/tauri-export.mjs`
with `scripts/tauri-csp.mjs`, which templates `tauri.conf.json` from a new
`tauri.conf.template.json`, substituting `${WRAP_API_ORIGIN}` from
`NEXT_PUBLIC_WRAP_API_URL` (default `http://localhost:7071` if unset, and a
hard error on `*`). The new CSP names the configured Functions origin in
`connect-src` and reaches Anthropic only through that backend — the old
`api.anthropic.com` allowance is gone. `security.devCsp` additionally
allows `http://localhost:3000` and `ws://localhost:3000` for Next dev /
HMR. `withGlobalTauri: false` and `macOSPrivateApi: false` are now
explicit. Placeholder icons (orange flat-colour 32/128/256/512/1024 PNGs +
a generated `.icns` + `.ico`) ship so `tauri:build` succeeds end-to-end;
a real icon set is a follow-up. `tauri:check` script added and wired into
`.github/workflows/ci.yml` as a `paths-filter`-gated job so the crate
can't silently break without Rust on every developer's machine. The
no-divergence invariant lands as `test/unit/tauri-invariants.test.ts` —
asserts no static `@tauri-apps/api/*` imports under `src/`, that
`endpoint.ts` still throws when `NEXT_PUBLIC_WRAP_API_URL` is unset (no
implicit Tauri fallback), that `next.config.mjs` keeps the
`TAURI=1` → `output: 'export'` mapping, and (when an `out/` directory
exists) that the static export contains no `_next/server` and no
`"use server"` directive in any emitted HTML. The `README.md`,
`ARCHITECTURE.md`, `CLAUDE.md`, and `src-tauri/README.md` were already
ahead of the implementation; verified they describe the post-spec state
accurately. No deviation from the Solution shape.
