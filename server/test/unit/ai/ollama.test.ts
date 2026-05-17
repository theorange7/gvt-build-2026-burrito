import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import { callOllama } from '../../../src/ai/providers/ollama';
import { UpstreamError } from '../../../src/privacy';
import type { ModelOption } from '../../../src/ai/models';

const baseModel: ModelOption = {
  id: 'ollama:llama3.1-8b',
  label: 'Llama 3.1 8B (Ollama, local)',
  provider: 'ollama',
  modelId: 'llama3.1:8b',
  parameters: { temperature: 0.7, num_ctx: 8192 },
};

const originalEnv = process.env.OLLAMA_BASE_URL;

afterEach(() => {
  if (originalEnv === undefined) delete process.env.OLLAMA_BASE_URL;
  else process.env.OLLAMA_BASE_URL = originalEnv;
  vi.useRealTimers();
});

beforeEach(() => {
  delete process.env.OLLAMA_BASE_URL;
});

describe('ai/providers/ollama.callOllama', () => {
  it('POSTs to {baseUrl}/api/chat with stream:false and threads parameters into options', async () => {
    type CapturedBody = { model: string; stream: boolean; messages: unknown[]; options: unknown };
    let captured: { url: string; body: CapturedBody } | null = null;
    server.use(
      http.post('http://localhost:11434/api/chat', async ({ request }) => {
        captured = {
          url: request.url,
          body: (await request.json()) as CapturedBody,
        };
        return HttpResponse.json({ message: { role: 'assistant', content: 'hi from llama' } });
      }),
    );

    const out = await callOllama('sys', 'msg', { ...baseModel, baseUrl: 'http://localhost:11434' });
    expect(out).toBe('hi from llama');
    expect(captured!.url).toBe('http://localhost:11434/api/chat');
    expect(captured!.body.model).toBe('llama3.1:8b');
    expect(captured!.body.stream).toBe(false);
    expect(captured!.body.messages).toEqual([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'msg' },
    ]);
    expect(captured!.body.options).toEqual({ temperature: 0.7, num_ctx: 8192 });
  });

  it('does not send any Authorization header (Ollama is unauthenticated)', async () => {
    let captured: string | null = 'present';
    server.use(
      http.post('http://localhost:11434/api/chat', ({ request }) => {
        captured = request.headers.get('authorization');
        return HttpResponse.json({ message: { content: 'ok' } });
      }),
    );

    await callOllama('s', 'm', { ...baseModel, baseUrl: 'http://localhost:11434' });
    expect(captured).toBeNull();
  });

  it('prefers per-model baseUrl over OLLAMA_BASE_URL env', async () => {
    process.env.OLLAMA_BASE_URL = 'http://other:11434';
    let hit: string | null = null;
    server.use(
      http.post('http://example.local:11434/api/chat', ({ request }) => {
        hit = request.url;
        return HttpResponse.json({ message: { content: 'from per-model' } });
      }),
      http.post('http://other:11434/api/chat', () =>
        HttpResponse.json({ message: { content: 'from env (should not hit)' } }),
      ),
    );

    const result = await callOllama('s', 'm', { ...baseModel, baseUrl: 'http://example.local:11434' });
    expect(hit).toBe('http://example.local:11434/api/chat');
    expect(result).toBe('from per-model');
  });

  it('falls back to OLLAMA_BASE_URL when the model has no baseUrl', async () => {
    process.env.OLLAMA_BASE_URL = 'http://env-host:11434';
    let hit: string | null = null;
    server.use(
      http.post('http://env-host:11434/api/chat', ({ request }) => {
        hit = request.url;
        return HttpResponse.json({ message: { content: 'env-host' } });
      }),
    );

    await callOllama('s', 'm', baseModel);
    expect(hit).toBe('http://env-host:11434/api/chat');
  });

  it('uses the http://localhost:11434 default when neither override is set', async () => {
    let hit: string | null = null;
    server.use(
      http.post('http://localhost:11434/api/chat', ({ request }) => {
        hit = request.url;
        return HttpResponse.json({ message: { content: 'default' } });
      }),
    );

    await callOllama('s', 'm', baseModel);
    expect(hit).toBe('http://localhost:11434/api/chat');
  });

  it('throws UpstreamError(ollama_unreachable) with a hint naming the baseUrl on connection error', async () => {
    server.use(
      http.post('http://localhost:11434/api/chat', () => HttpResponse.error()),
    );
    let thrown: unknown;
    try {
      await callOllama('s', 'm', { ...baseModel, baseUrl: 'http://localhost:11434' });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(UpstreamError);
    const err = thrown as UpstreamError;
    expect(err.code).toBe('ollama_unreachable');
    expect(err.status).toBeUndefined();
    expect(err.hint).toContain('http://localhost:11434');
    expect(err.hint).toContain('ollama serve');
  });

  it('throws UpstreamError(not_found) with a `ollama pull <modelId>` hint on 404', async () => {
    server.use(
      http.post('http://localhost:11434/api/chat', () =>
        new HttpResponse('model not found leaked-canary', { status: 404 }),
      ),
    );
    let thrown: unknown;
    try {
      await callOllama('s', 'm', baseModel);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(UpstreamError);
    const err = thrown as UpstreamError;
    expect(err.code).toBe('not_found');
    expect(err.status).toBe(404);
    expect(err.hint).toContain('ollama pull llama3.1:8b');
    // The upstream body must not leak into the thrown error anywhere.
    expect(err.hint).not.toContain('leaked-canary');
    expect(err.message).not.toContain('leaked-canary');
    expect(JSON.stringify(err)).not.toContain('leaked-canary');
  });

  it('does not include a hint or the baseUrl on a normal 4xx', async () => {
    server.use(
      http.post('http://localhost:11434/api/chat', () =>
        new HttpResponse('bad request body sensitive-canary', { status: 400 }),
      ),
    );
    let thrown: unknown;
    try {
      await callOllama('s', 'm', { ...baseModel, baseUrl: 'http://localhost:11434' });
    } catch (e) {
      thrown = e;
    }
    const err = thrown as UpstreamError;
    expect(err.code).toBe('upstream_4xx');
    expect(err.status).toBe(400);
    expect(err.hint).toBeUndefined();
    expect(JSON.stringify(err)).not.toContain('11434');
    expect(JSON.stringify(err)).not.toContain('sensitive-canary');
  });

  it('retries on 429 then succeeds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let attempts = 0;
    server.use(
      http.post('http://localhost:11434/api/chat', () => {
        attempts += 1;
        if (attempts < 2) return new HttpResponse('rate limited', { status: 429 });
        return HttpResponse.json({ message: { content: 'after-retry' } });
      }),
    );
    const promise = callOllama('s', 'm', baseModel);
    await vi.advanceTimersByTimeAsync(1100);
    const result = await promise;
    expect(result).toBe('after-retry');
    expect(attempts).toBe(2);
  });

  it('retries on 503 then succeeds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let attempts = 0;
    server.use(
      http.post('http://localhost:11434/api/chat', () => {
        attempts += 1;
        if (attempts < 3) return new HttpResponse('busy', { status: 503 });
        return HttpResponse.json({ message: { content: 'final' } });
      }),
    );
    const promise = callOllama('s', 'm', baseModel);
    await vi.advanceTimersByTimeAsync(3100);
    const result = await promise;
    expect(result).toBe('final');
    expect(attempts).toBe(3);
  });

  it('gives up after the last retry with upstream_5xx', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    server.use(
      http.post('http://localhost:11434/api/chat', () =>
        new HttpResponse('boom', { status: 502 }),
      ),
    );
    // Attach the rejection assertion BEFORE advancing timers so the failing
    // promise has a handler when its rejection fires inside the timer loop.
    const assertion = expect(callOllama('s', 'm', baseModel)).rejects.toMatchObject({
      name: 'UpstreamError',
      code: 'upstream_5xx',
      status: 502,
    });
    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;
  });

  it('throws UpstreamError(parse_failed) when the response has no message.content', async () => {
    server.use(
      http.post('http://localhost:11434/api/chat', () => HttpResponse.json({ message: {} })),
    );
    await expect(callOllama('s', 'm', baseModel)).rejects.toMatchObject({
      name: 'UpstreamError',
      code: 'parse_failed',
    });
  });
});
