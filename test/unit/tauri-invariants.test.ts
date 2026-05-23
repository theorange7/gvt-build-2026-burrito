// @vitest-environment node
/*
 * Static-analysis "no shell divergence" invariants for spec 40.
 *
 * The browser app and the Tauri shell render from the same React tree. These
 * rules keep that contract from quietly breaking:
 *
 * 1. No file under `src/` imports `@tauri-apps/api/*` at module scope. Any
 *    future Tauri-only behaviour has to live behind a dynamic import + an
 *    `isTauri()` guard so the browser bundle stays free of the Tauri runtime.
 * 2. `src/lib/ai/endpoint.ts` continues to throw when
 *    `NEXT_PUBLIC_WRAP_API_URL` is unset — no "we're in Tauri, use a
 *    different default" branch.
 * 3. `next.config.mjs` keeps the `TAURI=1` → `output: 'export'` mapping. The
 *    `.app` has no Node runtime; standalone is not an escape hatch.
 *
 * Failure of any rule should be treated as "the shell just diverged from the
 * browser" — back out, don't add an exception.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const srcDir = join(repoRoot, 'src');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (full.endsWith('.ts') || full.endsWith('.tsx')) out.push(full);
  }
  return out;
}

describe('tauri invariants — no @tauri-apps/api imports at module scope', () => {
  const files = walk(srcDir);

  it('finds source files to scan', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('no file under src/ statically imports @tauri-apps/api/*', () => {
    // Match both `import … from '@tauri-apps/api/...'` and bare side-effect
    // `import '@tauri-apps/api/...'`. Dynamic `await import(...)` is allowed
    // and intentionally excluded from this regex.
    const banned = /^\s*import\s+(?:[^'"]*?from\s+)?['"]@tauri-apps\/api\b/m;
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      expect(source, `${relative(repoRoot, file)} must not statically import @tauri-apps/api`)
        .not.toMatch(banned);
    }
  });
});

describe('tauri invariants — endpoint.ts requires NEXT_PUBLIC_WRAP_API_URL', () => {
  const endpointPath = join(srcDir, 'lib', 'ai', 'endpoint.ts');

  it('throws when the env var is unset (no Tauri-specific default)', () => {
    const source = readFileSync(endpointPath, 'utf8');
    expect(source).toMatch(/throw new Error\([^)]*NEXT_PUBLIC_WRAP_API_URL/);
    // Belt-and-braces: there should be no `isTauri` branch that hands back a
    // fallback URL when the env is missing.
    expect(source).not.toMatch(/isTauri\s*\(/);
    expect(source).not.toMatch(/__TAURI/);
  });
});

describe('tauri invariants — next.config.mjs preserves the static-export switch', () => {
  const configPath = join(repoRoot, 'next.config.mjs');

  it("TAURI=1 maps to output: 'export'", () => {
    const source = readFileSync(configPath, 'utf8');
    // The single source of truth: a `TAURI === '1'` check and an `output: 'export'`
    // both present in the same file.
    expect(source).toMatch(/process\.env\.TAURI\s*===\s*['"]1['"]/);
    expect(source).toMatch(/output:\s*['"]export['"]/);
  });

  it('does not fall back to standalone output (no Node runtime in the .app)', () => {
    const source = readFileSync(configPath, 'utf8');
    expect(source).not.toMatch(/output:\s*['"]standalone['"]/);
  });
});

describe('tauri invariants — stale wrapper script is gone', () => {
  it('scripts/tauri-export.mjs is absent (no stash-dance script)', () => {
    let exists = true;
    try {
      statSync(join(repoRoot, 'scripts', 'tauri-export.mjs'));
    } catch {
      exists = false;
    }
    expect(exists).toBe(false);
  });
});

describe('tauri invariants — config templating wired up', () => {
  const tauriDir = join(repoRoot, 'src-tauri');
  const templatePath = join(tauriDir, 'tauri.conf.template.json');
  const confPath = join(tauriDir, 'tauri.conf.json');

  it('tauri.conf.template.json exists with a substitutable origin marker', () => {
    const source = readFileSync(templatePath, 'utf8');
    expect(source).toContain('${WRAP_API_ORIGIN}');
    // The template still has to be valid JSON before substitution.
    expect(() => JSON.parse(source)).not.toThrow();
  });

  it('tauri.conf.json no longer whitelists api.anthropic.com', () => {
    const source = readFileSync(confPath, 'utf8');
    expect(source).not.toContain('api.anthropic.com');
  });

  it('beforeBuildCommand runs the CSP templater', () => {
    const conf = JSON.parse(readFileSync(confPath, 'utf8')) as {
      build?: { beforeBuildCommand?: string };
    };
    expect(conf.build?.beforeBuildCommand ?? '').toContain('tauri-csp.mjs');
  });
});
