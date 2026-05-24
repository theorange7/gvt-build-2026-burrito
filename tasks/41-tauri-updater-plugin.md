# Spec 41 — Tauri auto-updater (signed `.app.tar.gz` + hosted manifest)

**Status**: Shaped — ready to pick up
**Branch**: client (everything under `src-tauri/`, `scripts/`, `.github/workflows/`, plus a new `src/components/dashboard/UpdatePrompt.tsx`)
**Appetite**: medium (≤ 3 days; one day for the plugin + signing wiring, one day for the manifest hosting + release-workflow extension, half a day for the in-app prompt and dismiss/snooze UX)
**Last shaped**: 2026-05-23
**Depends on**: Spec 40 (Tauri shell bootstrap — done). Optional but
recommended: Apple Developer ID for notarisation (otherwise every update
still triggers Gatekeeper's right-click → Open).

## Problem

Spec 40 produced a working `pnpm tauri:build` and a tag-triggered release
workflow that uploads unsigned `.dmg` + `.app.tar.gz` artifacts. Users who
install the `.app` today have **no way to discover or apply a new version**
short of revisiting the release page and reinstalling by hand. That's fine
for an alpha shipping to a handful of people; it won't scale to broader
internal distribution and it's a footgun if a privacy-relevant fix lands
and old installs keep contacting an outdated backend with a stale CSP.

We also have a concrete piece of context that makes the "just tell people
to redownload" path worse than usual: the JS bundle inside the `.app`
embeds `NEXT_PUBLIC_WRAP_API_URL` and the corresponding `connect-src`
allowance in the CSP. If we ever move the backend to a new origin, every
installed `.app` becomes a brick — `connect-src` blocks the new host
silently and the wrap flow hangs. Auto-update is the lever we use to drag
the install base to the new origin without a manual redeploy email.

What "out of scope" looks like for v1:
- We don't yet have an Apple Developer ID, so the **binary itself** stays
  unsigned. Gatekeeper still complains on the very first launch of the
  initial install, but applied updates do not re-trigger the
  right-click → Open dance because the updater swaps the bundle in place.
- We don't have a public-facing distribution site; the manifest lives at
  a stable GitHub Releases URL for now.

## Solution shape

Three pieces, all in one PR on a new `claude/spec-41-*` branch.

### 1. Generate and store the updater signing keypair

`tauri-plugin-updater` ships its own minisign-style signing scheme — it is
independent of Apple code signing. A keypair produced by
`pnpm tauri signer generate -w ~/.tauri/wrapped-updater.key` produces:

- A **private key** (password-protected). Lives in the GitHub Actions secret
  `TAURI_UPDATER_PRIVATE_KEY`. Never committed.
- A **password** for the private key. Lives in `TAURI_UPDATER_KEY_PASSWORD`.
- A **public key** (a one-line string). Goes into `tauri.conf.template.json`
  under `plugins.updater.pubkey`. The CSP templater leaves it alone.

Rotation: regenerating the keypair invalidates every install's ability to
verify future updates — i.e., it requires a one-time forced reinstall.
Document this in `src-tauri/README.md` so we don't burn ourselves in six
months when a contractor rotates "to be safe".

### 2. Wire the plugin into the Rust crate + JS surface

`Cargo.toml` gains `tauri-plugin-updater = "2"`. `src/lib.rs`:

```rust
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

`tauri.conf.template.json` gains:

```json
"plugins": {
  "updater": {
    "endpoints": [
      "https://github.com/theorange7/gvt-build-2026-burrito/releases/latest/download/update-manifest.json"
    ],
    "pubkey": "<public key generated in piece 1>"
  }
}
```

`package.json` adds `@tauri-apps/plugin-updater` (the JS client).

On the React side, add one new component:
`src/components/dashboard/UpdatePrompt.tsx`. It calls `check()` on mount
behind the existing `isTauri()` guard from `src/lib/local-store/platform.ts`
(loaded via dynamic `import('@tauri-apps/plugin-updater')` so the browser
bundle stays clean — enforced by `test/unit/tauri-invariants.test.ts`).
On an available update, it shows a small banner above the dashboard with
"Update to vX.Y.Z" and "Later". User-initiated only — never silent. The
banner persists across reloads via a Dexie `meta` row keyed by
`updateDismissedFor` so "Later" doesn't nag again until the next version
lands.

### 3. Extend the release workflow to emit and host the manifest

`.github/workflows/release.yml` gains a step after the build:

```yaml
- name: Sign artifacts + generate update manifest
  env:
    TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_UPDATER_PRIVATE_KEY }}
    TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_UPDATER_KEY_PASSWORD }}
  run: |
    # `tauri build` with TAURI_SIGNING_PRIVATE_KEY set emits a .sig
    # alongside the .app.tar.gz. We then template a manifest JSON and
    # upload it as a release asset named `update-manifest.json`.
    node scripts/tauri-manifest.mjs \
      --tag "${{ github.ref_name }}" \
      --tarball "$TARBALL" \
      --signature "$TARBALL.sig" \
      --out update-manifest.json
- name: Attach manifest to release
  env:
    GH_TOKEN: ${{ github.token }}
  run: gh release upload "${{ github.ref_name }}" update-manifest.json --clobber
```

The manifest URL pinned in `tauri.conf.template.json` is
`releases/latest/download/update-manifest.json` — GitHub auto-redirects
that to the asset on the newest non-draft release, so every promoted
release becomes the new "latest" without any further action.

`scripts/tauri-manifest.mjs` is a ~30-line script that reads the `.sig`
file's base64, the artifact URL (computed from the tag), and writes the
shape `tauri-plugin-updater` expects (`version`, `notes`, `pub_date`,
`platforms.darwin-aarch64`, `platforms.darwin-x86_64`, `platforms.darwin-universal`
— all three pointing at the same universal tarball is the safe default).

## Rabbit holes

- **Don't roll your own update logic.** A `fetch('/version.json')` + manual
  reinstall workflow is tempting because it's smaller, but the plugin's
  signed-tarball verification is the whole reason this is safe to enable
  without notarisation. Reinventing it means reinventing the signing
  scheme too.

- **Don't store the private key anywhere but GitHub Actions secrets.**
  Not in `.env.local`, not in 1Password's "shared" vault, not in a wiki
  page. Compromise of the private key = attacker can push a malicious
  update to every install. Rotation invalidates every existing install's
  ability to receive future updates, so treat the key as long-lived and
  high-value.

- **Don't pin the manifest URL to a specific tag** (e.g.
  `releases/download/v0.1.0/...`). Use
  `releases/latest/download/update-manifest.json` so promoting a release
  to "latest" on GitHub is the one action that ships an update. Pinning
  to a specific tag means every release requires editing
  `tauri.conf.template.json` and shipping a new build first — a chicken
  and egg.

- **Don't enable silent auto-install.** `tauri-plugin-updater` supports it;
  we don't want it. Every update needs an explicit user action (the
  banner's "Update" button → relaunch). Silent updates are how malware
  vendors lose user trust.

- **Don't bundle release notes in the manifest from a fragile source.**
  Read them from the GitHub release body via the same `gh` invocation
  that uploads the manifest. The release page is the single source of
  truth; the manifest mirrors it.

- **Don't promise compatibility across breaking storage migrations**
  via the updater. If the encryption envelope ever changes shape, the
  release notes need a one-line "this update re-encrypts on first
  launch — make sure you remember your passphrase" warning. The
  updater is a delivery mechanism, not a migration coordinator.

- **Don't enable the updater in dev or in the browser build.** The
  plugin is conditionally loaded behind `isTauri()` and the new
  invariant test in spec 40 already forbids static `@tauri-apps/api/*`
  imports — extend that test to also forbid static
  `@tauri-apps/plugin-updater` imports.

## No-gos

- Apple code signing + notarisation in this spec. They unblock
  "first-launch without right-click → Open"; they don't change how the
  updater works. Separate spec, needs an Apple Developer account and
  CI secrets for `APPLE_*`.
- Windows / Linux updater targets. macOS-only, same as spec 40.
- Auto-update on launch without user opt-in. The banner is the
  contract.
- Hosting the manifest on a custom domain or our Azure Functions
  backend. GitHub Releases is the v1 host; revisit only if we
  observe rate-limit issues.
- A "force update" mechanism (the backend rejecting requests from old
  client versions). That's a server change, not an updater change,
  and lives in its own spec when there's a concrete reason to break
  old clients.
- Telemetry on update-check results. We have no telemetry surface;
  not adding one for this.

## Verification

- **`pnpm tauri:check` passes** with the new dependency.
- **`pnpm test`** passes; the existing `tauri-invariants` test is
  extended to also forbid static `@tauri-apps/plugin-updater` imports
  under `src/` (must be behind a dynamic `import()` + `isTauri()`
  guard).
- **Manual end-to-end on macOS**:
  1. Generate keypair, populate the two GitHub secrets, paste the
     public key into `tauri.conf.template.json`.
  2. Tag `v0.1.0`, push, observe a release with `.dmg`,
     `.app.tar.gz`, `.app.tar.gz.sig`, and `update-manifest.json`.
  3. Install the `.app`. Verify the banner does *not* appear.
  4. Bump `version` in `Cargo.toml` and
     `src-tauri/tauri.conf.template.json` to `0.2.0`, tag `v0.2.0`,
     push. Promote the new release to "latest".
  5. Relaunch the installed `0.1.0` app. Verify the banner appears
     within a few seconds. Click "Update". Verify the app relaunches
     as `0.2.0`. Click "Later" on a hypothetical `0.3.0`, confirm
     dismissal persists across relaunches but reappears when
     `0.4.0` ships.
- **Manifest is well-formed**:
  `curl -L https://github.com/theorange7/gvt-build-2026-burrito/releases/latest/download/update-manifest.json | jq .`
  returns a structure with `version`, `notes`, `pub_date`, and
  `platforms.darwin-universal.{url,signature}`.
- **Signature verification works**: temporarily corrupt the
  `.app.tar.gz` between download and install, observe the plugin
  reject the update with a signature-mismatch error rather than
  silently installing it.
- **CSP unchanged**: the updater fetches the manifest and the
  artifact from `github.com` / `objects.githubusercontent.com`
  via the Tauri runtime, **not** via the WebView's `fetch`. No CSP
  edit needed; verify by leaving the existing
  `connect-src 'self' ${WRAP_API_ORIGIN}` in place and confirming
  updates still work.

## Notes

- This spec was unblocked by spec 40 (which delivered the buildable
  shell + the tag-triggered release workflow). It does not block
  any other spec.
- Pairs naturally with a future "notarisation" spec — adding signing
  doesn't change anything about the updater, but it does mean
  applied updates land without any Gatekeeper interaction at all.
- Touches: `src-tauri/Cargo.toml` (add `tauri-plugin-updater`),
  `src-tauri/src/lib.rs` (register the plugin),
  `src-tauri/tauri.conf.template.json` (add `plugins.updater`),
  `package.json` (add `@tauri-apps/plugin-updater`),
  `scripts/tauri-manifest.mjs` (new),
  `.github/workflows/release.yml` (sign + emit manifest + upload),
  `src/components/dashboard/UpdatePrompt.tsx` (new),
  `src/components/dashboard/DashboardShell.tsx` (mount the prompt),
  `src/lib/local-store/meta.ts` (new `updateDismissedFor` field) or
    a small Dexie addition,
  `test/unit/tauri-invariants.test.ts` (forbid static
    `@tauri-apps/plugin-updater` imports under `src/`),
  `src-tauri/README.md` (operator notes on key generation + rotation),
  `README.md` and `ARCHITECTURE.md` (one paragraph each).
- Follow-up specs this enables (do not implement here):
  - Notarised + signed `.dmg` (Apple Developer ID, entitlements,
    `APPLE_*` CI secrets).
  - Windows / Linux updater targets if/when those build targets exist.
  - A "what's new" modal on first launch after update (reads the
    release notes the manifest already carries).
