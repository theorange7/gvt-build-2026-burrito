// @vitest-environment node
/*
 * Static-analysis privacy invariants for the **client** package. The backend
 * lives in `server/` and has its own privacy-invariants test under
 * `server/test/unit/privacy-invariants.test.ts`. These rules verify that:
 *
 * - The Next.js app no longer hosts an `/api` directory (queue/auth moved to
 *   the backend).
 * - The client-side `lib/ai/` is now thin HTTP wrappers and must not import
 *   any LLM/Azure SDK or persist anything to the wire beyond the typed shape.
 * - The browser-only local-store remains isolated from any server bundle
 *   pathway.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const clientAiDir = join(repoRoot, 'src', 'lib', 'ai');
const apiDir = join(repoRoot, 'src', 'app', 'api');
const providersDir = join(repoRoot, 'src', 'lib', 'providers');
const orchestratorPath = join(providersDir, 'orchestrator.ts');
const sharedDir = join(repoRoot, 'shared', 'src');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (full.endsWith('.ts') || full.endsWith('.tsx')) out.push(full);
  }
  return out;
}

function dirExists(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

describe('privacy invariants — Next.js no longer hosts API routes', () => {
  it('src/app/api/ does not exist (moved to server/)', () => {
    expect(dirExists(apiDir)).toBe(false);
  });
});

describe('privacy invariants — client AI wrappers stay thin', () => {
  const files = walk(clientAiDir);

  it('finds the expected wrapper files', () => {
    const names = files.map((f) => relative(repoRoot, f));
    expect(names).toEqual(
      expect.arrayContaining([
        join('src', 'lib', 'ai', 'classify.ts'),
        join('src', 'lib', 'ai', 'generate.ts'),
        join('src', 'lib', 'ai', 'endpoint.ts'),
        join('src', 'lib', 'ai', 'import.ts'),
        join('src', 'lib', 'ai', 'models.ts'),
        join('src', 'lib', 'ai', 'reset.ts'),
        join('src', 'lib', 'ai', 'share.ts'),
      ]),
    );
  });

  it('never imports any LLM or Azure SDK', () => {
    const banned = [
      /from ['"]@anthropic-ai\/sdk['"]/,
      /from ['"]@azure\/ai-projects['"]/,
      /from ['"]@azure\/identity['"]/,
      /from ['"]@azure\/service-bus['"]/,
      /from ['"]@azure\/data-tables['"]/,
      /from ['"]openai['"]/,
      /from ['"]jose['"]/,
    ];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const re of banned) {
        expect(source, `${file} must not import via ${re}`).not.toMatch(re);
      }
    }
  });

  it('never reads server-only env (ANTHROPIC_API_KEY, AZURE_*, WRAP_JWT_SECRET)', () => {
    const banned = [
      /process\.env\.ANTHROPIC_API_KEY/,
      /process\.env\.AZURE_FOUNDRY_PROJECT_ENDPOINT/,
      /process\.env\.AZURE_SERVICE_BUS_NAMESPACE/,
      /process\.env\.AZURE_TABLES_ENDPOINT/,
      /process\.env\.WRAP_JWT_SECRET/,
    ];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const re of banned) {
        expect(source, `${file} must not read ${re}`).not.toMatch(re);
      }
    }
  });

  it('never logs tokens, request bodies, or signal text', () => {
    const banned = [
      /console\.[a-z]+\([^)]*\bauthorization\b/i,
      /console\.[a-z]+\([^)]*\btoken\b/i,
      /console\.[a-z]+\([^)]*\bsliceContent\b/,
      /console\.[a-z]+\([^)]*\bcontributions\b/,
      /console\.[a-z]+\([^)]*\bfreeText\b/,
    ];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const re of banned) {
        expect(source, `${file} must not log via ${re}`).not.toMatch(re);
      }
    }
  });
});

describe('privacy invariants — shared package is types-only', () => {
  const files = walk(sharedDir);

  it('shared/ does not import any project source from src/ or server/', () => {
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      expect(source, `${file} must not import @/`).not.toMatch(/from ['"]@\//);
      expect(source, `${file} must not import server modules`).not.toMatch(
        /from ['"]\.\.\/\.\.\/(server|src)\b/,
      );
    }
  });

  it('shared/ does not import any LLM or Azure SDK', () => {
    const banned = [
      /from ['"]@anthropic-ai\/sdk['"]/,
      /from ['"]@azure\//,
      /from ['"]openai['"]/,
      /from ['"]jose['"]/,
    ];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const re of banned) {
        expect(source, `${file} must not import via ${re}`).not.toMatch(re);
      }
    }
  });
});

describe('privacy invariants — provider modules are storage-pure', () => {
  const files = walk(providersDir);

  it('finds at least the gitlab-dedicated provider and the orchestrator', () => {
    const names = files.map((f) => relative(repoRoot, f));
    expect(names).toEqual(
      expect.arrayContaining([
        join('src', 'lib', 'providers', 'orchestrator.ts'),
        join('src', 'lib', 'providers', 'gitlab-dedicated', 'index.ts'),
      ]),
    );
  });

  it('only the orchestrator may import from local-store', () => {
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      const importsLocalStore = /from ['"]@\/lib\/local-store/.test(source);
      if (file === orchestratorPath) {
        expect(importsLocalStore, `${file} is the bridge and must import local-store`).toBe(true);
      } else {
        expect(
          importsLocalStore,
          `${file} must not import local-store — providers are storage-pure`,
        ).toBe(false);
      }
    }
  });

  it('never logs tokens, refresh tokens, Authorization headers, or full request/response bodies', () => {
    const banned = [
      /console\.[a-z]+\([^)]*['"`]?accessToken/i,
      /console\.[a-z]+\([^)]*['"`]?refreshToken/i,
      /console\.[a-z]+\([^)]*['"`]?Authorization/i,
      /console\.[a-z]+\([^)]*\bbody\b/i,
      /console\.[a-z]+\([^)]*\bpayload\b/i,
    ];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const re of banned) {
        expect(source, `${file} must not log secrets via ${re}`).not.toMatch(re);
      }
    }
  });

  it('every provider index.ts carries a PRIVACY banner', () => {
    const indexFiles = files.filter(
      (f) => f.endsWith(`/index.ts`) && f !== join(providersDir, 'index.ts'),
    );
    expect(indexFiles.length).toBeGreaterThan(0);
    for (const file of indexFiles) {
      const source = readFileSync(file, 'utf8');
      expect(source, `${file} must include a PRIVACY banner`).toMatch(/PRIVACY/);
    }
  });
});

describe('privacy invariants — reset module boundaries', () => {
  const aiResetPath = join(repoRoot, 'src', 'lib', 'ai', 'reset.ts');
  const localStoreResetPath = join(repoRoot, 'src', 'lib', 'local-store', 'reset.ts');

  it('src/lib/ai/reset.ts does not import any LLM or Azure SDK', () => {
    const source = readFileSync(aiResetPath, 'utf8');
    const banned = [
      /from ['"]@anthropic-ai\/sdk['"]/,
      /from ['"]@azure\/ai-projects['"]/,
      /from ['"]@azure\/identity['"]/,
      /from ['"]@azure\/data-tables['"]/,
      /from ['"]openai['"]/,
      /from ['"]jose['"]/,
    ];
    for (const re of banned) {
      expect(source, `ai/reset.ts must not import via ${re}`).not.toMatch(re);
    }
  });

  it('src/lib/ai/reset.ts does not log the install token', () => {
    const source = readFileSync(aiResetPath, 'utf8');
    expect(source).not.toMatch(/console\.[a-z]+\([^)]*\btoken\b/i);
    expect(source).not.toMatch(/console\.[a-z]+\([^)]*\bauthorization\b/i);
  });

  it('src/lib/local-store/reset.ts only imports from src/lib/ai/ via reset.ts', () => {
    const source = readFileSync(localStoreResetPath, 'utf8');
    // May import from ai/reset but not other ai modules
    const aiImports = [...source.matchAll(/from ['"]@\/lib\/ai\/([^'"]+)['"]/g)].map((m) => m[1]);
    for (const imp of aiImports) {
      expect(imp, `local-store/reset.ts must only import from ai/reset`).toBe('reset');
    }
  });
});

describe('privacy invariants — share-viewer bundle has no telemetry (spec 31)', () => {
  const viewerJsPath = join(repoRoot, 'share-viewer', 'dist', 'viewer.js');

  it('contains no XMLHttpRequest or sendBeacon usage', () => {
    const raw = readFileSync(viewerJsPath, 'utf8');
    // Strip comments — the file's own docstring mentions these names while
    // forbidding their use.
    const source = raw
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
    expect(source).not.toMatch(/\bnew\s+XMLHttpRequest\b/);
    expect(source).not.toMatch(/\bsendBeacon\s*\(/);
  });

  it('contains no third-party hostnames', () => {
    const source = readFileSync(viewerJsPath, 'utf8');
    const urls = source.match(/https?:\/\/[^\s'"`)]+/g) ?? [];
    expect(urls).toEqual([]);
  });

  it('the only fetch() call is the same-origin ./video.mp4 HEAD probe', () => {
    const source = readFileSync(viewerJsPath, 'utf8');
    const fetchCalls = [...source.matchAll(/\bfetch\s*\(\s*(['"`])([^'"`]+)\1/g)].map(
      (m) => m[2],
    );
    expect(fetchCalls).toEqual(['./video.mp4']);
  });
});

describe('privacy invariants — Prisma is fully excised', () => {
  it('package.json has no prisma deps', () => {
    const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      scripts?: Record<string, string>;
    };
    const all = { ...pkg.dependencies, ...pkg.devDependencies };
    expect(all['@prisma/client']).toBeUndefined();
    expect(all['prisma']).toBeUndefined();
    for (const [name, cmd] of Object.entries(pkg.scripts ?? {})) {
      expect(cmd, `script ${name}`).not.toMatch(/prisma/i);
    }
  });

  it('no prisma/ directory exists', () => {
    let exists = true;
    try {
      statSync(join(repoRoot, 'prisma'));
    } catch {
      exists = false;
    }
    expect(exists).toBe(false);
  });
});
