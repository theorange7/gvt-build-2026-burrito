# Tauri 2 macOS Shell

This directory hosts the Tauri 2 shell that wraps the Next.js frontend as a
native `.app` for macOS. It is the v2 distribution target — the v1 shipping
form is the browser app at `/dashboard`.

## Why Tauri (vs Electron, vs PWA)

- **Real macOS Keychain access** via `tauri-plugin-stronghold` /
  `tauri-plugin-keychain` — replaces the in-memory `cachedKey` in
  `src/lib/local-store/crypto.ts` with an OS-bound key vault.
- **Filesystem persistence** — sidesteps Safari's 7-day storage eviction.
- **~6 MB binary** — small surface area, native menus.

## Bootstrap (one-time, requires Rust)

```bash
# install Rust toolchain
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# scaffold the Rust crate inside this directory
cd src-tauri
cargo init
cargo add tauri --features "macos-private-api"
cargo add tauri-build --build
```

Then create `tauri.conf.json` (template below) and `Cargo.toml` with the
Tauri 2 dependencies. The frontend build is wired via `pnpm tauri:dev` /
`pnpm tauri:build` (defined in `package.json`).

## Configuration

`tauri.conf.json` should contain:

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Wrapped for Work",
  "version": "0.1.0",
  "identifier": "com.wrapped.work",
  "build": {
    "frontendDist": "../out",
    "devUrl": "http://localhost:3000",
    "beforeDevCommand": "TAURI=1 pnpm dev",
    "beforeBuildCommand": "TAURI=1 pnpm build"
  },
  "app": {
    "windows": [
      {
        "title": "Wrapped for Work",
        "width": 1280,
        "height": 820,
        "minWidth": 960,
        "minHeight": 640,
        "decorations": true,
        "fullscreen": false
      }
    ],
    "security": {
      "csp": "default-src 'self'; connect-src 'self' https://api.anthropic.com https://your-stateless-proxy.example; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:"
    }
  },
  "bundle": {
    "active": true,
    "targets": ["dmg"],
    "icon": ["icons/icon.icns"]
  }
}
```

## Data layer

The Tauri shell reuses `src/lib/local-store/*` unchanged. Detection happens
via `isTauri()` in `src/lib/local-store/platform.ts`. A future enhancement
swaps the in-memory key cache for `tauri-plugin-stronghold` when running in
the shell.

## AI proxy

The stateless `/api/classify` and `/api/wrap` endpoints cannot run inside
the Tauri shell (Tauri only ships the static frontend, not Node routes).
Deploy the Next.js app to Vercel/Fly/etc. and point the Tauri build at it
via `NEXT_PUBLIC_API_BASE` (TODO: thread this through `fetch` calls in
`ManualInputForm.tsx` and `GenerateWrapModal.tsx`).
