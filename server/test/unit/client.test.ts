import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { callClaude } from '../../src/ai/client';
import { UpstreamError } from '../../src/privacy';

describe('ai/client.callClaude', () => {
  const originalKey = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
  });

  afterEach(() => {
    process.env.ANTHROPIC_API_KEY = originalKey;
    vi.useRealTimers();
  });

  it('throws UpstreamError(config_missing) when ANTHROPIC_API_KEY is missing', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    await expect(callClaude('sys', 'msg')).rejects.toMatchObject({
      name: 'UpstreamError',
      code: 'config_missing',
    });
  });

  it('returns the text from the first content block', async () => {
    server.use(
      http.post('https://api.anthropic.com/v1/messages', () =>
        HttpResponse.json({ content: [{ type: 'text', text: '{"signal":"ok"}' }] }),
      ),
    );
    const result = await callClaude('sys', 'msg');
    expect(result).toBe('{"signal":"ok"}');
  });

  it('forwards the API key in the x-api-key header', async () => {
    let capturedKey: string | null = null;
    server.use(
      http.post('https://api.anthropic.com/v1/messages', ({ request }) => {
        capturedKey = request.headers.get('x-api-key');
        return HttpResponse.json({ content: [{ type: 'text', text: 'ok' }] });
      }),
    );
    await callClaude('s', 'm');
    expect(capturedKey).toBe('test-key');
  });

  it('retries on 429 then succeeds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let attempts = 0;
    server.use(
      http.post('https://api.anthropic.com/v1/messages', () => {
        attempts += 1;
        if (attempts < 2) return new HttpResponse('rate limited', { status: 429 });
        return HttpResponse.json({ content: [{ type: 'text', text: 'after-retry' }] });
      }),
    );
    const promise = callClaude('s', 'm');
    await vi.advanceTimersByTimeAsync(1100);
    const result = await promise;
    expect(result).toBe('after-retry');
    expect(attempts).toBe(2);
  });

  it('retries on 529 then succeeds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let attempts = 0;
    server.use(
      http.post('https://api.anthropic.com/v1/messages', () => {
        attempts += 1;
        if (attempts < 3) return new HttpResponse('overloaded', { status: 529 });
        return HttpResponse.json({ content: [{ type: 'text', text: 'final' }] });
      }),
    );
    const promise = callClaude('s', 'm');
    await vi.advanceTimersByTimeAsync(3100);
    const result = await promise;
    expect(result).toBe('final');
    expect(attempts).toBe(3);
  });

  it('throws UpstreamError(upstream_4xx) on non-retriable upstream 4xx and does not embed the body', async () => {
    let attempts = 0;
    const canary = 'leaked-prompt-fragment-CANARY-y3p2';
    server.use(
      http.post('https://api.anthropic.com/v1/messages', () => {
        attempts += 1;
        return new HttpResponse(canary, { status: 400 });
      }),
    );
    let thrown: unknown;
    try {
      await callClaude('s', 'm');
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(UpstreamError);
    const err = thrown as UpstreamError;
    expect(err.code).toBe('upstream_4xx');
    expect(err.status).toBe(400);
    // The whole point of #6 — the upstream body must not survive into the
    // thrown error.
    expect(err.message).not.toContain(canary);
    expect(JSON.stringify(err)).not.toContain(canary);
    expect(attempts).toBe(1);
  });

  it('throws UpstreamError(parse_failed) when no text block is returned', async () => {
    server.use(
      http.post('https://api.anthropic.com/v1/messages', () =>
        HttpResponse.json({ content: [] }),
      ),
    );
    await expect(callClaude('s', 'm')).rejects.toMatchObject({
      name: 'UpstreamError',
      code: 'parse_failed',
    });
  });
});
