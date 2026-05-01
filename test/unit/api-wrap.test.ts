// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { NextRequest } from 'next/server';
import { server } from '../mocks/server';
import { POST } from '@/app/api/wrap/route';
import { pickResponseFor } from '../fixtures/anthropic';

const originalKey = process.env.ANTHROPIC_API_KEY;

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = 'test-key';
});

afterEach(() => {
  process.env.ANTHROPIC_API_KEY = originalKey;
});

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost/api/wrap', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const baseContribution = {
  source: 'github' as const,
  category: 'delivery' as const,
  signal: 'shipped a thing',
  rawData: { pr: 1 },
  occurredAt: '2025-04-01T00:00:00Z',
  weight: 3,
};

const baseBody = {
  contributions: [baseContribution],
  mode: 'snapshot' as const,
  windowStart: '2025-04-01',
  windowEnd: '2025-06-30',
};

describe('POST /api/wrap', () => {
  beforeEach(() => {
    server.use(
      http.post('https://api.anthropic.com/v1/messages', async ({ request }) => {
        const body = (await request.json()) as { system: string };
        return HttpResponse.json({
          content: [{ type: 'text', text: JSON.stringify(pickResponseFor(body.system)) }],
        });
      }),
    );
  });

  it('returns 10 slices for a valid request', async () => {
    const response = await POST(makeRequest(baseBody));
    expect(response.status).toBe(200);
    const json = (await response.json()) as { sliceContent: Array<{ sliceKey: string }> };
    expect(json.sliceContent).toHaveLength(10);
  });

  it('rejects payloads with malformed contributions', async () => {
    const response = await POST(
      makeRequest({
        ...baseBody,
        contributions: [{ ...baseContribution, weight: 99 }],
      }),
    );
    expect(response.status).toBe(500);
  });

  it('strips extra identity fields like userId/id/externalId before reaching the AI call', async () => {
    let userMessages: string[] = [];
    server.use(
      http.post('https://api.anthropic.com/v1/messages', async ({ request }) => {
        const body = (await request.json()) as { system: string; messages: Array<{ content: string }> };
        userMessages.push(body.messages[0].content);
        return HttpResponse.json({
          content: [{ type: 'text', text: JSON.stringify(pickResponseFor(body.system)) }],
        });
      }),
    );

    const canary = 'CANARY-userid-leak-9f1b';
    await POST(
      makeRequest({
        ...baseBody,
        contributions: [
          {
            ...baseContribution,
            userId: canary,
            id: 'leak-id',
            externalId: 'leak-ext',
            externalUrl: 'https://leak/example',
          } as object,
        ],
      }),
    );

    const allUserText = userMessages.join('\n');
    expect(allUserText).not.toContain(canary);
    expect(allUserText).not.toContain('leak-id');
    expect(allUserText).not.toContain('leak-ext');
  });

  it('does not log request bodies (canary spy)', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const consoleDebug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);

    const canary = 'CANARY-7f3a-wrap';
    await POST(
      makeRequest({
        ...baseBody,
        contributions: [{ ...baseContribution, signal: canary }],
      }),
    );

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

  it('returns 500 with an error message on bad JSON', async () => {
    const req = new NextRequest('http://localhost/api/wrap', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not-json',
    });
    const response = await POST(req);
    expect(response.status).toBe(500);
  });
});
