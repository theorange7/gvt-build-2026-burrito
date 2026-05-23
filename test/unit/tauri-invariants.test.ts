// @vitest-environment node
/*
 * Static-analysis "no shell divergence" invariants for the Tauri target.
 *
 * The whole point of the shell is that the browser app and the .app render
 * from the same React tree. These checks fail CI if a change forks the two
 * surfaces — for example by importing a Tauri runtime API into the shared
 * `src/` tree, by relaxing the requirement for an explicit backend URL, or
 * by breaking the `TAURI=1` → static-export mapping that lets the bundler
 * load `out/`.
 *
 * See `tasks/40-tauri-shell-bootstrap.md` ("Lock in the no shell divergence
 * invariant") for the contract.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const srcDir = join(repoRoot, 'src');
const endpointPath = join(repoRoot, 'src', 'lib', 'ai', 'endpoint.ts');
const nextConfigPath = join(repoRoot, 'next.config.mjs');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (full.endsWith('.ts') || full.endsWith('.tsx')) out.push(full);
  }
  return out;
}

describe('tauri invariants — no static @tauri-apps/api imports in src/', () => {
  it('every module under src/ is free of top-level Tauri runtime imports', () => {
    // Static imports of the Tauri JS runtime would pull `__TAURI_INTERNALS__`
    // references and platform-only code paths into the browser bundle. Any
    // Tauri-only behaviour must be loaded lazily behind an isTauri() guard so
    // browser users never download it.
    const staticImport = /^\s*import\s+[^;]*?\bfrom\s+['"]@tauri-apps\/api(\/[^'"]+)?['"]/m;
    for (const file of walk(srcDir)) {
      const source = readFileSync(file, 'utf8');
      expect(
        source,
        `${relative(repoRoot, file)} must not statically import @tauri-apps/api/*`,
      ).not.toMatch(staticImport);
    }
  });
});

describe('tauri invariants — backend URL has no implicit Tauri fallback', () => {
  it('endpoint.ts throws when NEXT_PUBLIC_WRAP_API_URL is unset', () => {
    const source = readFileSync(endpointPath, 'utf8');
    // The function must read the env var and throw if missing. No conditional
    // "we're inside Tauri, use a different default" branch is allowed —
    // distribution builds must name their backend explicitly.
    expect(source).toMatch(/process\.env\.NEXT_PUBLIC_WRAP_API_URL/);
    expect(source).toMatch(/throw new Error/);
    expect(source, 'endpoint.ts must not fork on Tauri detection').not.toMatch(
      /isTauri\s*\(/,
    );
    expect(source, 'endpoint.ts must not check __TAURI_INTERNALS__').not.toMatch(
      /__TAURI_INTERNALS__/,
    );
  });
});

describe('tauri invariants — next.config preserves TAURI=1 export mapping', () => {
  it('next.config.mjs maps TAURI=1 to output: export', () => {
    const source = readFileSync(nextConfigPath, 'utf8');
    expect(source).toMatch(/process\.env\.TAURI\s*===\s*['"]1['"]/);
    expect(source).toMatch(/output:\s*['"]export['"]/);
  });
});

describe('tauri invariants — static export is clean when present', () => {
  // The full assertion (`TAURI=1 pnpm build` produces an out/ with no
  // _next/server) is documented in tasks/40-tauri-shell-bootstrap.md and
  // executed in CI when the build runs. This check is a cheap belt-and-braces
  // verification that runs whenever an `out/` happens to be present locally —
  // it catches a developer who built without TAURI=1 and then ran the suite.
  const outDir = join(repoRoot, 'out');

  it.runIf(existsSync(outDir))('out/ has no _next/server directory', () => {
    expect(existsSync(join(outDir, '_next', 'server'))).toBe(false);
  });

  it.runIf(existsSync(outDir))('no exported .html contains "use server"', () => {
    function htmlFiles(dir: string): string[] {
      const out: string[] = [];
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) out.push(...htmlFiles(full));
        else if (full.endsWith('.html')) out.push(full);
      }
      return out;
    }
    for (const file of htmlFiles(outDir)) {
      const source = readFileSync(file, 'utf8');
      expect(source, `${relative(repoRoot, file)} contains a Server-Action marker`).not.toMatch(
        /"use server"/,
      );
    }
  });
});
