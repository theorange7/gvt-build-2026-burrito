# Runbook: Manual Tauri builds (macOS)

Local build of the Tauri 2 macOS shell (`.app` + `.dmg`). Use this for
release-candidate testing on your own machine, for reproducing a failing
CI release run, or when CI is broken and you need to ship a one-off.

> **Steady-state shipping should go through CI** — see `ci-deploys.md`
> for the `Release Tauri shell` workflow (tag-triggered, universal
> binary, draft GitHub release). This runbook covers the manual path
> only.

## Prerequisites

One-time setup on a macOS machine:

1. **macOS host** — the bundler only runs on macOS. Apple Silicon is
   preferred (matches the CI runner); Intel works but can only build a
   single-arch `.app` unless you add the cross-compile target.

2. **Rust toolchain** (1.77 or later):
   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   rustup update stable
   ```

3. **Both macOS targets** (only required for the universal binary; skip
   for single-arch builds):
   ```bash
   rustup target add aarch64-apple-darwin x86_64-apple-darwin
   ```

4. **Xcode Command Line Tools**:
   ```bash
   xcode-select --install
   ```

5. **Node + pnpm dependencies**:
   ```bash
   pnpm install
   ```
   `@tauri-apps/cli` is a devDependency — no global install needed.

## Steps

### 1. Set the backend URL

The built `.app` calls the deployed Azure Functions backend. The URL is
baked into both the JS bundle and the bundled CSP at build time — you
cannot change it after the bundle ships.

```bash
export NEXT_PUBLIC_WRAP_API_URL=https://<your-function-app>.azurewebsites.net/api
```

If unset, `scripts/tauri-csp.mjs` falls back to `http://localhost:7071`
— that's fine for testing the build locally against `func start`, but
**a release artifact baked against localhost is a broken artifact**.
Set the variable explicitly before any build you intend to share.

A wildcard (`*`) is rejected — the whole point of the shell is a CSP
that names the actual backend origin.

### 2. Verify the crate compiles (optional but fast)

```bash
pnpm tauri:check
```

`cargo check` against the crate — no bundler, no window, no JS rebuild.
Use this as a quick sanity check before paying the full bundle cost.

### 3. Build

For a single-arch build matching your host (the default — Apple Silicon
on M-series Macs):

```bash
pnpm tauri:build
```

For a universal binary (recommended for anything you share):

```bash
pnpm tauri build --target universal-apple-darwin
```

Under the hood, both invocations run:

1. **`scripts/tauri-csp.mjs`** — reads `NEXT_PUBLIC_WRAP_API_URL` and
   writes `src-tauri/tauri.conf.json` from `tauri.conf.template.json`,
   substituting the origin into the CSP. The generated file is
   `.gitignore`d; do not commit it.
2. **`TAURI=1 pnpm build`** — `next build` with `output: 'export'`,
   producing a static site in `out/`. Server-only routes are absent
   (asserted by `test/unit/tauri-invariants.test.ts`).
3. **`tauri build`** — compiles the Rust shell, bundles `out/` into
   `Resources/`, and emits the `.app` + `.dmg`.

Output locations:

```
# Single-arch (host arch)
src-tauri/target/release/bundle/
  macos/   Wrapped for Work.app
  dmg/     Wrapped for Work_<version>_aarch64.dmg   (or _x64.dmg)

# Universal
src-tauri/target/universal-apple-darwin/release/bundle/
  macos/   Wrapped for Work.app
  dmg/     Wrapped for Work_<version>_universal.dmg
```

### 4. Smoke test locally

```bash
open "src-tauri/target/release/bundle/macos/Wrapped for Work.app"
# (or the universal-apple-darwin path)
```

Gatekeeper will block the first launch — right-click → Open to bypass,
or strip the quarantine bit:

```bash
xattr -dr com.apple.quarantine \
  "src-tauri/target/release/bundle/macos/Wrapped for Work.app"
```

Once open, verify the golden path:

- The unlock gate appears and accepts a fresh passphrase.
- The dashboard loads with the seeded demo contributions.
- Generating a wrap reaches the backend you configured in step 1
  (check the macOS Console.app for the `connect-src` origin if you
  suspect CSP drift).
- Closing and re-opening the app preserves your passphrase-encrypted
  store (data lives under
  `~/Library/Application Support/com.wrapped.app/` — do not delete
  this unless you're intentionally testing first-run).

### 5. Package an `.app.tar.gz` (optional)

Matches the format CI uploads — useful for testing the auto-updater
artifact shape (spec 41) before CI is involved:

```bash
cd src-tauri/target/universal-apple-darwin/release/bundle/macos
tar -czf "Wrapped for Work.app.tar.gz" "Wrapped for Work.app"
```

## Distribution

The `.app` is **unsigned** in v1 (no Apple Developer ID). Options:

- **Hand the `.dmg` or zipped `.app` to known recipients.** They right-click
  → Open on first launch. Acceptable for internal alpha distribution.
- **Upload as a GitHub release asset** — same UX as the CI release flow.
  If you're doing this for a real version bump, prefer the CI workflow
  (`docs/runbooks/ci-deploys.md`) so the artifact is reproducible from
  a tag.

Do **not** ship a manual build as "the official vX.Y.Z release". Tag a
commit and let CI build it, so the artifact is reproducible and the
build provenance is in GitHub Actions logs.

For public distribution, the `.app` must be signed + notarised — that's
a follow-up spec (Apple Developer account, `APPLE_*` CI secrets,
entitlements). Do not attempt notarisation from this runbook.

## Rollback

A manual build is a file on your disk — "rollback" is just `rm`-ing it
and re-running step 3 against the previous commit:

```bash
git checkout <previous-good-sha>
pnpm install --frozen-lockfile   # in case lockfile changed
export NEXT_PUBLIC_WRAP_API_URL=https://...
pnpm tauri build --target universal-apple-darwin
```

If you handed out a bad build:

1. Tell recipients to delete `/Applications/Wrapped for Work.app` and
   reinstall from a corrected build.
2. The encrypted local store lives in
   `~/Library/Application Support/com.wrapped.app/` and is decoupled
   from the `.app` — recipients keep their data across reinstalls.
3. Until spec 41's auto-updater ships, there is no push channel to
   pull a bad build back from machines it's already on. Bias toward
   slow manual rollouts.

## Troubleshooting

| Symptom | Check |
|---|---|
| `cargo: command not found` | Rust toolchain not on `PATH`. `source "$HOME/.cargo/env"` or re-open your shell. |
| `error: linking with cc failed` | Xcode Command Line Tools missing or stale. `xcode-select --install`, then `xcode-select -p` should print a path. |
| Universal build fails with `target not installed` | `rustup target add aarch64-apple-darwin x86_64-apple-darwin`. |
| `scripts/tauri-csp.mjs` errors with "not a valid URL" | `NEXT_PUBLIC_WRAP_API_URL` is set to something that isn't a URL (e.g. just a hostname). Use the full `https://host/api` form. |
| `scripts/tauri-csp.mjs` errors with `*` not allowed | You set `NEXT_PUBLIC_WRAP_API_URL=*`. Use the actual backend origin. |
| `tauri build` fails on icon bundling | Placeholder icons under `src-tauri/icons/` aren't being accepted. Regenerate from a real PNG: `pnpm tauri icon path/to/icon.png`. |
| `.app` launches but the wrap flow hangs | CSP / backend URL mismatch. Open Console.app, filter for `CSP`, look for `Refused to connect to <origin>` — the origin in the error is what the bundle was built against. Rebuild with the correct `NEXT_PUBLIC_WRAP_API_URL`. |
| `.app` launches but shows a blank screen | The static export under `out/` was empty or malformed. Re-run `TAURI=1 pnpm build` standalone and check for errors before invoking `tauri build`. |
| `.app` works locally but breaks for recipients | They didn't right-click → Open the first time. Or their macOS is older than the deployment target in `Cargo.toml`. Check the recipient's macOS version. |
| `pnpm tauri:dev` works but `pnpm tauri:build` fails | Dev uses `next dev` (server); build uses `next build` with `output: 'export'`. A "use server" directive or a server-only API route under `src/app/` will pass dev and fail the export. Run `TAURI=1 pnpm build` standalone to see the export error. |
| Build succeeds but `.dmg` is missing | Bundle target list in `tauri.conf.template.json` doesn't include `dmg`. Check `bundle.targets`. |
