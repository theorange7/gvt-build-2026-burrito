#!/usr/bin/env node
/*
 * Templates `src-tauri/tauri.conf.json` from `src-tauri/tauri.conf.template.json`,
 * substituting `${WRAP_API_ORIGIN}` with the origin extracted from
 * `NEXT_PUBLIC_WRAP_API_URL`. Tauri's bundler reads `tauri.conf.json`, so the
 * generated file is what gets baked into the `.app`'s Content Security Policy.
 *
 * Resolution rule:
 * - If `NEXT_PUBLIC_WRAP_API_URL` is set, use its origin (scheme + host + port).
 * - Otherwise, fall back to `http://localhost:7071` (matches `func start`).
 *
 * A wildcard (`*`) is explicitly rejected — see `tasks/40-tauri-shell-bootstrap.md`
 * "Rabbit holes". The smaller attack surface is the whole point of the shell.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
const templatePath = join(repoRoot, 'src-tauri', 'tauri.conf.template.json');
const outPath = join(repoRoot, 'src-tauri', 'tauri.conf.json');

const fallbackOrigin = 'http://localhost:7071';
const rawUrl = process.env.NEXT_PUBLIC_WRAP_API_URL;

function resolveOrigin(url) {
  if (!url) return fallbackOrigin;
  if (url.trim() === '*') {
    throw new Error('NEXT_PUBLIC_WRAP_API_URL=* is not allowed — the CSP must name the actual backend origin.');
  }
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`NEXT_PUBLIC_WRAP_API_URL is not a valid URL: ${url}`);
  }
  return parsed.origin;
}

const origin = resolveOrigin(rawUrl);
const template = readFileSync(templatePath, 'utf8');
const rendered = template.replaceAll('${WRAP_API_ORIGIN}', origin);

// Parse to validate the rendered JSON before writing.
try {
  JSON.parse(rendered);
} catch (err) {
  throw new Error(`Rendered tauri.conf.json is not valid JSON: ${err.message}`);
}

writeFileSync(outPath, rendered);
console.log(`tauri-csp: wrote ${outPath} (connect-src origin = ${origin})`);
