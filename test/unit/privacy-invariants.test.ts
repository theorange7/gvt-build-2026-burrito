// @vitest-environment node
/*
 * Static-analysis privacy invariants. These tests encode the trust boundary
 * documented in the architecture: the API routes must not import server-side
 * persistence, must not log payloads, and must not pull from the local-store
 * (which is browser-only and would expose us to leaks if accidentally bundled).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const apiDir = join(repoRoot, 'src', 'app', 'api');
const providersDir = join(repoRoot, 'src', 'lib', 'providers');
const orchestratorPath = join(providersDir, 'orchestrator.ts');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (full.endsWith('.ts') || full.endsWith('.tsx')) out.push(full);
  }
  return out;
}

describe('privacy invariants — API routes', () => {
  const files = walk(apiDir);

  it('finds at least the classify and wrap routes', () => {
    const names = files.map((f) => relative(repoRoot, f));
    expect(names).toEqual(
      expect.arrayContaining([
        join('src', 'app', 'api', 'classify', 'route.ts'),
        join('src', 'app', 'api', 'wrap', 'route.ts'),
      ]),
    );
  });

  it('never imports @prisma/client', () => {
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      expect(source, `${file} must not import @prisma/client`).not.toMatch(/@prisma\/client/);
    }
  });

  it('never imports a server-side db.ts', () => {
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      expect(source, `${file} must not import @/lib/db`).not.toMatch(/from ['"]@\/lib\/db['"]/);
    }
  });

  it('never imports the browser-only local-store', () => {
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      expect(source, `${file} must not import @/lib/local-store/*`).not.toMatch(/from ['"]@\/lib\/local-store/);
    }
  });

  it('never reads or writes filesystem paths under user data dirs', () => {
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      // Allow reading bundled JSON via fetch in seed.ts (browser); API routes
      // shouldn't touch fs at all.
      expect(source, `${file} should not import node:fs`).not.toMatch(/from ['"]node:fs['"]|from ['"]fs['"]/);
    }
  });

  it('carries a privacy banner comment', () => {
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      expect(source, `${file} must include a PRIVACY banner`).toMatch(/PRIVACY/);
    }
  });
});

describe('privacy invariants — local-store is not imported by API/server code', () => {
  const serverDirs = [
    join(repoRoot, 'src', 'app', 'api'),
    join(repoRoot, 'src', 'lib', 'ai'),
  ];

  it('nobody under /api or src/lib/ai pulls in local-store', () => {
    for (const dir of serverDirs) {
      for (const file of walk(dir)) {
        const source = readFileSync(file, 'utf8');
        expect(source, `${file} must not import local-store`).not.toMatch(
          /from ['"]@\/lib\/local-store/,
        );
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

describe('privacy invariants — API routes never import providers', () => {
  const files = walk(apiDir);
  it('nobody under /api pulls in src/lib/providers', () => {
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      expect(source, `${file} must not import @/lib/providers`).not.toMatch(
        /from ['"]@\/lib\/providers/,
      );
    }
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
