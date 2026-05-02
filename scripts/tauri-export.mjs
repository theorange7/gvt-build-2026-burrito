#!/usr/bin/env node
/*
 * Static-export wrapper for Tauri builds.
 *
 * The `/api/**` route handlers use POST + `dynamic = 'force-dynamic'`, which
 * `output: export` rejects. They're intended to run as a remote proxy in the
 * Tauri shell, not bundled into the .app. Temporarily relocate the directory
 * so `next build` can produce a clean static export, then restore it — even
 * if the build fails or the process is interrupted.
 */
import { execSync } from 'node:child_process';
import { existsSync, renameSync } from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(new URL('..', import.meta.url).pathname);
const apiDir = path.join(repoRoot, 'src', 'app', 'api');
const stashDir = path.join(repoRoot, 'src', 'app', '_api.stash');

let moved = false;
const restore = () => {
  if (moved && existsSync(stashDir)) {
    renameSync(stashDir, apiDir);
    moved = false;
  }
};

process.on('exit', restore);
process.on('SIGINT', () => { restore(); process.exit(130); });
process.on('SIGTERM', () => { restore(); process.exit(143); });

if (existsSync(apiDir)) {
  if (existsSync(stashDir)) {
    console.error(`Refusing to start: ${stashDir} already exists from a prior interrupted build.`);
    process.exit(1);
  }
  renameSync(apiDir, stashDir);
  moved = true;
}

try {
  execSync('pnpm exec next build', {
    stdio: 'inherit',
    cwd: repoRoot,
    env: { ...process.env, TAURI: '1', NODE_ENV: 'production' },
  });
} catch (err) {
  restore();
  process.exit(typeof err.status === 'number' ? err.status : 1);
}

restore();
