// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { NextRequest } from 'next/server';
import { server } from '../mocks/server';
import { POST } from '@/app/api/classify/route';

const originalKey = process.env.ANTHROPIC_API_KEY;

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = 'test-key';
});

afterEach(() => {
  process.env.ANTHROPIC_API_KEY = originalKey;
});

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost/api/classify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/classify', () => {
  it('returns the classified result', async () => {
    server.use(
      http.post('https://api.anthropic.com/v1/messages', () =>
        HttpResponse.json({
          content: [{ type: 'text', text: JSON.stringify({ signal: 'shipped X', category: 'delivery', weight: 3 }) }],
        }),
      ),
    );
    const response = await POST(makeRequest({ freeText: 'I shipped X', source: 'manual' }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ signal: 'shipped X', category: 'delivery', weight: 3 });
  });

  it('rejects empty freeText', async () => {
    const response = await POST(makeRequest({ freeText: '', source: 'manual' }));
    expect(response.status).toBe(500);
  });

  it('does not log request bodies (canary spy)', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const consoleDebug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);

    const canary = 'CANARY-7f3a-classify';
    server.use(
      http.post('https://api.anthropic.com/v1/messages', () =>
        HttpResponse.json({
          content: [{ type: 'text', text: JSON.stringify({ signal: 's', category: 'other', weight: 1 }) }],
        }),
      ),
    );

    await POST(makeRequest({ freeText: canary, source: 'manual' }));

    const allCalls = [
      ...consoleSpy.mock.calls.flat(),
      ...consoleInfo.mock.calls.flat(),
      ...consoleDebug.mock.calls.flat(),
    ].map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg)));
    const leaked = allCalls.some((s) => s.includes(canary));
    expect(leaked).toBe(false);

    consoleSpy.mockRestore();
    consoleInfo.mockRestore();
    consoleDebug.mockRestore();
  });
});

import { vi } from 'vitest';
