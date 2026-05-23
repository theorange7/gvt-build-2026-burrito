#!/usr/bin/env node
/*
 * Templates `src-tauri/tauri.conf.json` from `src-tauri/tauri.conf.template.json`
 * with the build-time backend origin substituted into the CSP `connect-src`.
 *
 * The shell ships with a strict CSP — every wrap call goes to exactly the
 * configured Functions origin, and nothing else. A wildcard would defeat the
 * point of having a shell at all.
 *
 * Resolution rule:
 *   - Read `NEXT_PUBLIC_WRAP_API_URL` from the env. This is the same var the
 *     JS bundle uses, so the CSP and `endpoint.ts` cannot disagree.
 *   - Extract the origin (scheme + host + optional port). The CSP needs an
 *     origin, not a full URL with `/api` path.
 *   - If unset, default to `http://localhost:7071` (matches `func start`).
 *     Print a warning so distribution builds don't ship a localhost CSP by
 *     accident.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const templatePath = path.join(repoRoot, 'src-tauri', 'tauri.conf.template.json');
const outputPath = path.join(repoRoot, 'src-tauri', 'tauri.conf.json');

const DEFAULT_ORIGIN = 'http://localhost:7071';

function originFor(rawUrl) {
  if (!rawUrl) {
    console.warn(
      '[tauri-csp] NEXT_PUBLIC_WRAP_API_URL is not set — defaulting to ' +
        `${DEFAULT_ORIGIN}. This is fine for local-dev builds; do not ship a ` +
        'distribution build without setting it.',
    );
    return DEFAULT_ORIGIN;
  }
  try {
    const u = new URL(rawUrl);
    return `${u.protocol}//${u.host}`;
  } catch (err) {
    throw new Error(
      `[tauri-csp] NEXT_PUBLIC_WRAP_API_URL is not a valid URL: ${rawUrl} (${err.message})`,
    );
  }
}

function main() {
  const origin = originFor(process.env.NEXT_PUBLIC_WRAP_API_URL);
  const template = readFileSync(templatePath, 'utf8');
  const rendered = template.replaceAll('${WRAP_API_ORIGIN}', origin);

  // Validate JSON before writing — a broken template would render an unusable
  // tauri.conf.json that `tauri build` only flags after running `next build`.
  try {
    JSON.parse(rendered);
  } catch (err) {
    throw new Error(`[tauri-csp] rendered config is not valid JSON: ${err.message}`);
  }

  writeFileSync(outputPath, `${rendered.trimEnd()}\n`);
  console.log(`[tauri-csp] wrote ${path.relative(repoRoot, outputPath)} with origin ${origin}`);
}

main();
