// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { isSeeded, seedFromBundledDemo } from '@/lib/local-store/seed';
import { listContributions } from '@/lib/local-store/contributions';
import { loadTestKey } from '../setup/key';

const here = dirname(fileURLToPath(import.meta.url));
const demoBytes = readFileSync(join(here, '..', '..', 'public', 'demo-contributions.json'));
const originalFetch = globalThis.fetch;

beforeAll(() => {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (url.endsWith('/demo-contributions.json')) {
      return new Response(demoBytes, { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return originalFetch(input);
  }) as typeof fetch;
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});

describe('local-store/seed', () => {
  beforeEach(async () => {
    await loadTestKey();
  });

  it('seeds 134 encrypted contributions from the bundled demo file', async () => {
    expect(await isSeeded()).toBe(false);
    const count = await seedFromBundledDemo();
    expect(count).toBe(134);
    expect(await isSeeded()).toBe(true);

    const list = await listContributions();
    expect(list).toHaveLength(134);
    expect(list.every((c) => typeof c.signal === 'string' && c.signal.length > 0)).toBe(true);
  });

  it('is idempotent: re-seeding clears and reloads', async () => {
    await seedFromBundledDemo();
    expect((await listContributions()).length).toBe(134);
    await seedFromBundledDemo();
    expect((await listContributions()).length).toBe(134);
  });
});
