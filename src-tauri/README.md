# Tauri 2 macOS Shell

The `src-tauri/` directory is the v2 distribution target — a native macOS
`.app` that bundles the Next.js frontend as a static export inside a Tauri 2
WebView. The browser app at `/dashboard` is the v1 target and remains the
primary surface.

**No-divergence guarantee**: the Tauri shell and the browser app load the
same React tree from the same build. A change to a slide component, the
dashboard, or any client-side logic ships into the shell automatically — no
Rust rebuild needed.

## Why Tauri

- Pins data to the macOS filesystem; sidesteps Safari's 7-day IndexedDB eviction.
- Keychain-backed encryption key in a future spec (replaces the in-memory
  `cachedKey` in `src/lib/local-store/crypto.ts`).
- ~6 MB binary, native menus, smaller attack surface than Electron.

## Architecture

The shell is a thin WKWebView wrapper. There are no Tauri `invoke` handlers
in v1 — crypto, storage, and AI all run in JavaScript exactly as they do in
the browser:

```
macOS .app
  └── WKWebView (tauri)
        └── Next.js static export  (src-tauri/../out/)
              └── src/lib/ai/  ──► HTTPS ──► Azure Functions backend
              └── src/lib/local-store/  ──► Dexie / IndexedDB
```

The backend URL (`NEXT_PUBLIC_WRAP_API_URL`) is baked into both the
JavaScript bundle and the Content Security Policy at build time via
`scripts/tauri-csp.mjs`.

## Prerequisites (one-time)

1. **Rust toolchain** (1.77 or later):

   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   rustup update
   ```

2. **Xcode Command Line Tools** (for the macOS linker):

   ```bash
   xcode-select --install
   ```

3. **Node / pnpm dependencies** (already installed via root `pnpm install` —
   `@tauri-apps/cli` is a devDependency):

   ```bash
   pnpm install
   ```

No additional Tauri CLI install is needed — the CLI runs through `pnpm tauri`.

## Dev

Open a native macOS window against the running Next.js dev server:

```bash
# Terminal 1 — Azure Functions backend (required for AI calls)
cd server
func start            # port 7071

# Terminal 2 — Tauri dev shell
pnpm tauri:dev
```

`tauri:dev` runs `TAURI=1 pnpm dev` in the background (Next.js dev server on
port 3000) then opens a WKWebView pointing at `http://localhost:3000`. React
hot-reload works normally — save a component and the WebView refreshes without
a Rust rebuild.

The dev CSP (from `tauri.conf.json`'s `security.devCsp`) allows:
- `http://localhost:3000` and `ws://localhost:3000` for the Next.js dev server + HMR.
- `http://localhost:7071` for the local Functions backend.

### Verify the Rust crate compiles (no window)

```bash
pnpm tauri:check      # runs cargo check
```

Use this in CI or on machines where opening a window isn't possible.

## Build and release

> Full operational runbook — single-arch vs. universal, smoke testing,
> distribution, rollback, troubleshooting — lives at
> `docs/runbooks/tauri-build.md`. The condensed version follows.

### 1. Set the backend URL

The built `.app` calls the deployed Azure Functions backend. Export the URL
before building:

```bash
export NEXT_PUBLIC_WRAP_API_URL=https://<your-function-app>.azurewebsites.net/api
```

If unset, the build defaults to `http://localhost:7071/api` (fine for local
testing; wrong for distribution).

### 2. Build

```bash
pnpm tauri:build
```

Under the hood this runs:

1. `scripts/tauri-csp.mjs` — reads `NEXT_PUBLIC_WRAP_API_URL`, writes
   `tauri.conf.json` from `tauri.conf.template.json` with the correct CSP
   `connect-src` origin.
2. `TAURI=1 pnpm build` — `next build` with `output: 'export'`, producing a
   static site in `out/`.
3. `tauri build` — compiles the Rust shell, bundles `out/`, and emits:

```
src-tauri/target/release/bundle/
  macos/   Wrapped for Work.app
  dmg/     Wrapped for Work_0.1.0_aarch64.dmg   (Apple Silicon)
            Wrapped for Work_0.1.0_x64.dmg       (Intel)
```

### 3. Install for local testing

```bash
open "src-tauri/target/release/bundle/macos/Wrapped for Work.app"
```

The `.app` is **unsigned** in v1. macOS Gatekeeper will block it on first
launch from Finder — right-click → Open to bypass, or:

```bash
xattr -dr com.apple.quarantine \
  "src-tauri/target/release/bundle/macos/Wrapped for Work.app"
```

### Distribution

For internal distribution, zip the `.app` or share the `.dmg` directly.
Recipients will need to right-click → Open on first launch.

For public distribution, the `.app` must be **signed and notarised** — that
is a follow-up spec (needs an Apple Developer account, `APPLE_*` CI secrets,
and entitlements). Do not attempt notarisation from this spec.

## Configuration

### `tauri.conf.template.json`

The template for `tauri.conf.json`. The build pipeline substitutes
`${WRAP_API_ORIGIN}` with the origin extracted from
`NEXT_PUBLIC_WRAP_API_URL`. Edit the template to change window dimensions,
bundle metadata, or CSP rules — do not edit `tauri.conf.json` directly (it
is generated).

### Key env vars at build time

| Var | Effect |
|-----|--------|
| `NEXT_PUBLIC_WRAP_API_URL` | Backend the shell calls; baked into CSP and `endpoint.ts`. |
| `TAURI=1` | Switches Next.js to `output: 'export'` (set automatically by the build pipeline). |

No secrets go into the shell. API credentials (`ANTHROPIC_API_KEY`,
`WRAP_JWT_SECRET`, etc.) live server-side only.

## What is not in v1

These are explicit follow-up specs — do not implement them here:

- **Stronghold / Keychain** — replace the in-memory `cachedKey` in
  `src/lib/local-store/crypto.ts` with `tauri-plugin-stronghold`. The
  detection seam (`isTauri()` in `platform.ts`) is already in place.
- **Code signing + notarisation** — Apple Developer account + CI secrets.
- **Auto-updater** — `tauri-plugin-updater` + hosted update manifest.
- **Windows / Linux targets** — macOS only for now.
- **Tauri invoke handlers** — no OS-level bridge in v1; all logic stays in JS.
- **Real icon set** — placeholder icons ship with v1; swap them once design is ready.
