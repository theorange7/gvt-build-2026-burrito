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
        join('src', 'functions', 'import.ts'),
        join('src', 'functions', 'meReset.ts'),
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
    // safeError no longer surfaces .message — flag any code that tries to log
    // it (which would defeat the whole purpose of the allowlist).
    /safeError\([^)]*\)\.message/,
    // Direct passthrough of err.message into a log call — a common shape that
    // bypasses safeError. Allow `.code` only.
    /(?:console|context)\.[a-z]+\([^)]*\b(?:err|error)\.message\b/,
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

describe('privacy invariants — meReset never emits identifiers', () => {
  const meResetPath = join(functionsDir, 'meReset.ts');

  it('meReset.ts exists', () => {
    let exists = false;
    try { exists = statSync(meResetPath).isFile(); } catch { /* */ }
    expect(exists).toBe(true);
  });

  it('meReset.ts starts with the PRIVACY banner', () => {
    const source = readFileSync(meResetPath, 'utf8');
    expect(source).toMatch(/PRIVACY/);
  });

  it('meReset.ts does not log installId, slug, jobId, or token', () => {
    const source = readFileSync(meResetPath, 'utf8');
    expect(source).not.toMatch(/console\.[a-z]+\([^)]*\binstallId\b/);
    expect(source).not.toMatch(/context\.[a-z]+\([^)]*\binstallId\b/);
    expect(source).not.toMatch(/console\.[a-z]+\([^)]*\bslug\b/);
    expect(source).not.toMatch(/console\.[a-z]+\([^)]*\bjobId\b/);
    expect(source).not.toMatch(/context\.[a-z]+\([^)]*\bjobId\b/);
    expect(source).not.toMatch(/console\.[a-z]+\([^)]*\btoken\b/);
  });

  it('meReset.ts does not import node:fs or src/ai/', () => {
    const source = readFileSync(meResetPath, 'utf8');
    expect(source).not.toMatch(/from ['"]node:fs['"]/);
    expect(source).not.toMatch(/from ['"]\.\.\/ai\//);
  });
});

describe('privacy invariants — installId never enters Service Bus message metadata (#7)', () => {
  it('queue/serviceBus.ts does not put installId in applicationProperties', () => {
    const file = join(srcDir, 'queue', 'serviceBus.ts');
    const source = readFileSync(file, 'utf8');
    // The applicationProperties object is the only place metadata leaves us;
    // it must reference jobLookupToken, never installId.
    const appPropsBlock = source.match(/applicationProperties:\s*\{[^}]*\}/);
    expect(appPropsBlock).not.toBeNull();
    expect(appPropsBlock![0]).not.toMatch(/\binstallId\b/);
    expect(appPropsBlock![0]).toMatch(/\bjobLookupToken\b/);
  });
});

describe('privacy invariants — Ollama adapter never logs, only hints with safe content', () => {
  const ollamaFile = join(srcDir, 'ai', 'providers', 'ollama.ts');
  const source = readFileSync(ollamaFile, 'utf8');

  it('contains no console.* calls', () => {
    expect(source).not.toMatch(/\bconsole\.[a-z]+\s*\(/);
  });

  it('contains no context.log/info/warn/error calls', () => {
    expect(source).not.toMatch(/\bcontext\.(?:log|info|warn|error)\s*\(/);
  });

  it('only references baseUrl in the ollama_unreachable hint (not in any other thrown UpstreamError)', () => {
    // Capture every `new UpstreamError(...)` constructor call.
    const ctorRe = /new UpstreamError\(([^)]*)\)/g;
    let m: RegExpExecArray | null;
    while ((m = ctorRe.exec(source)) !== null) {
      const args = m[1];
      const mentionsBaseUrl = /\bbaseUrl\b/.test(args);
      if (mentionsBaseUrl) {
        expect(args, `baseUrl may only appear in the ollama_unreachable hint, found in: ${args}`).toMatch(
          /'ollama_unreachable'/,
        );
      }
    }
  });
});

describe('privacy invariants — /import never persists, writes to disk, or logs file content (spec 50)', () => {
  const importPath = join(functionsDir, 'import.ts');
  const source = readFileSync(importPath, 'utf8');

  it('does not import from the queue (Service Bus / Tables) — the import path is synchronous and ephemeral', () => {
    expect(source).not.toMatch(/from ['"]\.\.\/queue\//);
    expect(source).not.toMatch(/from ['"]@azure\/service-bus['"]/);
    expect(source).not.toMatch(/from ['"]@azure\/data-tables['"]/);
  });

  it('does not import @azure/storage-blob or node:fs — nothing about a file upload should hit storage or disk', () => {
    expect(source).not.toMatch(/from ['"]@azure\/storage-blob['"]/);
    expect(source).not.toMatch(/from ['"]node:fs['"]/);
    expect(source).not.toMatch(/from ['"]fs['"]/);
  });

  it('does not log the file body, the model raw response, the label, or per-row signals', () => {
    expect(source).not.toMatch(/console\.[a-z]+\([^)]*\bfileText\b/);
    expect(source).not.toMatch(/console\.[a-z]+\([^)]*\bmetaRaw\b/);
    expect(source).not.toMatch(/console\.[a-z]+\([^)]*\blabel\b/);
    expect(source).not.toMatch(/context\.[a-z]+\([^)]*\bfileText\b/);
    expect(source).not.toMatch(/context\.[a-z]+\([^)]*\bmetaRaw\b/);
    expect(source).not.toMatch(/context\.[a-z]+\([^)]*\blabel\b/);
    // raw model output (named `raw` in the function) must never enter a log
    expect(source).not.toMatch(/console\.[a-z]+\([^)]*\braw\b/);
    expect(source).not.toMatch(/context\.[a-z]+\([^)]*\braw\b/);
  });
});

describe('privacy invariants — result row contains only sliceContent + jobId + timestamps', () => {
  it('queue/results.ts persists no IP, token, or contributions', () => {
    const file = join(srcDir, 'queue', 'results.ts');
    const source = readFileSync(file, 'utf8');
    expect(source).not.toMatch(/\bip\b/i);
    expect(source).not.toMatch(/token/i);
    expect(source).not.toMatch(/contributions/);
  });

  it('the ResultEntity row shape only carries payload + createdAt (no installId column)', () => {
    const file = join(srcDir, 'queue', 'results.ts');
    const source = readFileSync(file, 'utf8');
    // installId may appear as a parameter name (it's now the partition key
    // owner) but must NOT show up as a row column. The TableEntity literal
    // is the only place where columns are declared.
    const entityDecl = source.match(/type ResultEntity = TableEntity<\{[^}]*\}>/);
    expect(entityDecl).not.toBeNull();
    expect(entityDecl![0]).not.toMatch(/installId/);
  });
});
