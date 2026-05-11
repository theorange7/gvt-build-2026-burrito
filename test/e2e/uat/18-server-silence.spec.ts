import { test, expect } from '@playwright/test';
import { execSync } from 'node:child_process';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '../../..');

test.describe('UAT-018 — server silence (static invariants)', () => {
  test('src/app/api/ directory does not exist', () => {
    let exists = false;
    try {
      execSync(`ls "${REPO_ROOT}/src/app/api"`, { stdio: 'pipe' });
      exists = true;
    } catch {
      exists = false;
    }
    expect(exists, 'src/app/api/ must not exist').toBe(false);
  });

  test('no Prisma or next-auth imports in src/', () => {
    const result = execSync(
      `grep -rE "from ['\\"](next-auth|prisma|@prisma)['\\"\\/ ]" "${REPO_ROOT}/src/" 2>/dev/null | wc -l`,
      { encoding: 'utf8' },
    );
    expect(parseInt(result.trim(), 10)).toBe(0);
  });

  test('no ANTHROPIC_API_KEY reads in src/', () => {
    const result = execSync(
      `grep -rE "process\\.env\\.ANTHROPIC_API_KEY" "${REPO_ROOT}/src/" 2>/dev/null | wc -l`,
      { encoding: 'utf8' },
    );
    expect(parseInt(result.trim(), 10)).toBe(0);
  });

  test('no LLM SDK imports in src/lib/ai/', () => {
    const result = execSync(
      `grep -rE "from ['\\"@anthropic-ai/sdk|from ['\\"@azure/|from ['\\"openai" "${REPO_ROOT}/src/lib/ai/" 2>/dev/null | wc -l`,
      { encoding: 'utf8' },
    );
    expect(parseInt(result.trim(), 10)).toBe(0);
  });
});
