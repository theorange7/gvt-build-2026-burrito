/*
 * Static-analysis privacy invariants for the **backend**. These rules ensure
 * the server stays a narrow, payload-forwarding service:
 *
 * - Each HTTP/queue function file carries the PRIVACY banner.
 * - The server never imports the client app or its local-store (different
 *   package; an accidental relative import would be the only way).
 * - No `console.log` of message bodies, contributions, or sliceContent.
 * - The result-row entity stores only sliceContent (as JSON) + jobId +
 *   timestamps — never installId, IP, token, or contributions.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const serverRoot = join(here, '..', '..');
const srcDir = join(serverRoot, 'src');
const functionsDir = join(srcDir, 'functions');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (full.endsWith('.ts') || full.endsWith('.tsx')) out.push(full);
  }
  return out;
}

describe('privacy invariants — every Functions handler carries the PRIVACY banner', () => {
  const files = walk(functionsDir);

  it('finds the expected functions', () => {
    const names = files.map((f) => relative(serverRoot, f));
    expect(names).toEqual(
      expect.arrayContaining([
        join('src', 'functions', 'authRegister.ts'),
        join('src', 'functions', 'classify.ts'),
        join('src', 'functions', 'wrapEnqueue.ts'),
        join('src', 'functions', 'wrapGet.ts'),
        join('src', 'functions', 'wrapWorker.ts'),
      ]),
    );
  });

  it('every function file has a PRIVACY banner', () => {
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      expect(source, `${file} must include a PRIVACY banner`).toMatch(/PRIVACY/);
    }
  });
});

describe('privacy invariants — server never reaches into the client app', () => {
  const files = walk(srcDir);

  it('no server source imports @/ (the client TS path alias)', () => {
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      expect(source, `${file} must not import @/`).not.toMatch(/from ['"]@\//);
    }
  });

  it('no server source uses a relative import that escapes server/', () => {
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      // Allow `@wrapped/shared` (resolved via tsconfig paths to ../shared/src).
      // Block everything that walks into ../src or ../test or ../public.
      const matches = source.match(/from ['"](\.\.\/.+?)['"]/g) ?? [];
      for (const m of matches) {
        expect(m, `${file}: ${m}`).not.toMatch(/\.\.\/(src|server\/test|public)\b/);
      }
    }
  });
});

describe('privacy invariants — no logging of payloads, contributions, or sliceContent', () => {
  const files = walk(srcDir);
  const banned = [
    /console\.[a-z]+\([^)]*['"`]?accessToken/i,
    /console\.[a-z]+\([^)]*['"`]?refreshToken/i,
    /console\.[a-z]+\([^)]*\bauthorization\b/i,
    /console\.[a-z]+\([^)]*\bsliceContent\b/,
    /console\.[a-z]+\([^)]*\bcontributions\b/,
    /console\.[a-z]+\([^)]*\bfreeText\b/,
    /console\.[a-z]+\([^)]*\bpayload\b/,
    /console\.[a-z]+\([^)]*\buserMessage\b/,
    /context\.(log|info|warn|error)\([^)]*\bsliceContent\b/,
    /context\.(log|info|warn|error)\([^)]*\bcontributions\b/,
    /context\.(log|info|warn|error)\([^)]*\bpayload\b/,
  ];

  it('no banned log expressions appear in any server source', () => {
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const re of banned) {
        expect(source, `${file} must not log via ${re}`).not.toMatch(re);
      }
    }
  });
});

describe('privacy invariants — result row contains only sliceContent + jobId + timestamps', () => {
  it('queue/results.ts persists no installId, IP, token, or contributions', () => {
    const file = join(srcDir, 'queue', 'results.ts');
    const source = readFileSync(file, 'utf8');
    expect(source).not.toMatch(/installId/);
    expect(source).not.toMatch(/\bip\b/i);
    expect(source).not.toMatch(/token/i);
    expect(source).not.toMatch(/contributions/);
  });
});
