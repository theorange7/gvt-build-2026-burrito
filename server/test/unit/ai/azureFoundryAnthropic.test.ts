import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import { UpstreamError } from '../../../src/privacy';
import type { ModelOption } from '../../../src/ai/models';

// DefaultAzureCredential is replaced wholesale so getToken behaviour is
// controllable per test. vi.mock is hoisted above the adapter import, so the
// adapter binds to this fake. The adapter constructs the credential lazily and
// caches it, so a single shared mock fn is enough.
const { getTokenMock } = vi.hoisted(() => ({ getTokenMock: vi.fn() }));
vi.mock('@azure/identity', () => ({
  DefaultAzureCredential: class {
    getToken = getTokenMock;
  },
}));

import { callAzureFoundryAnthropic } from '../../../src/ai/providers/azureFoundryAnthropic';

const ENDPOINT = 'https://test-resource.services.ai.azure.com/anthropic';
const MESSAGES_URL = `${ENDPOINT}/v1/messages`;

const baseModel: ModelOption = {
  id: 'azure:claude-haiku-4-5',
  label: 'claude-haiku-4-5 (Azure Foundry)',
  provider: 'azure-foundry-anthropic',
  modelId: 'claude-haiku-4-5',
  parameters: { temperature: 1.0 },
};

const originalEndpoint = process.env.AZURE_FOUNDRY_ANTHROPIC_ENDPOINT;

beforeEach(() => {
  process.env.AZURE_FOUNDRY_ANTHROPIC_ENDPOINT = ENDPOINT;
  getTokenMock.mockReset();
  getTokenMock.mockResolvedValue({
    token: 'fake-entra-token',
    expiresOnTimestamp: Date.now() + 3_600_000,
  });
});

afterEach(() => {
  if (originalEndpoint === undefined) delete process.env.AZURE_FOUNDRY_ANTHROPIC_ENDPOINT;
  else process.env.AZURE_FOUNDRY_ANTHROPIC_ENDPOINT = originalEndpoint;
  vi.useRealTimers();
});

const textResponse = (text: string) =>
  HttpResponse.json({ content: [{ type: 'text', text }] });

describe('ai/providers/azureFoundryAnthropic.callAzureFoundryAnthropic', () => {
  it('throws UpstreamError(config_missing) when no endpoint is configured', async () => {
    delete process.env.AZURE_FOUNDRY_ANTHROPIC_ENDPOINT;
    await expect(callAzureFoundryAnthropic('sys', 'msg', baseModel)).rejects.toMatchObject({
      name: 'UpstreamError',
      code: 'config_missing',
    });
    // The endpoint check short-circuits before any token is requested.
    expect(getTokenMock).not.toHaveBeenCalled();
  });

  it('POSTs to {endpoint}/v1/messages and returns the first text block', async () => {
    server.use(http.post(MESSAGES_URL, () => textResponse('{"signal":"ok"}')));
    const out = await callAzureFoundryAnthropic('sys', 'msg', baseModel);
    expect(out).toBe('{"signal":"ok"}');
  });

  it('sends the Entra bearer token and Anthropic Messages headers', async () => {
    let headers: { authorization: string | null; version: string | null; contentType: string | null } | null = null;
    server.use(
      http.post(MESSAGES_URL, ({ request }) => {
        headers = {
          authorization: request.headers.get('authorization'),
          version: request.headers.get('anthropic-version'),
          contentType: request.headers.get('content-type'),
        };
        return textResponse('ok');
      }),
    );
    await callAzureFoundryAnthropic('s', 'm', baseModel);
    expect(headers!.authorization).toBe('Bearer fake-entra-token');
    expect(headers!.version).toBe('2023-06-01');
    expect(headers!.contentType).toBe('application/json');
    expect(getTokenMock).toHaveBeenCalledWith('https://cognitiveservices.azure.com/.default');
  });

  it('builds the Messages body with the deployment name, system prompt and parameters', async () => {
    type Body = {
      model: string;
      system: string;
      max_tokens: number;
      temperature: number;
      messages: unknown[];
    };
    let body: Body | null = null;
    server.use(
      http.post(MESSAGES_URL, async ({ request }) => {
        body = (await request.json()) as Body;
        return textResponse('ok');
      }),
    );
    await callAzureFoundryAnthropic('the-system-prompt', 'the-user-message', baseModel);
    expect(body!.model).toBe('claude-haiku-4-5');
    expect(body!.system).toBe('the-system-prompt');
    expect(body!.max_tokens).toBe(1024);
    expect(body!.temperature).toBe(1.0);
    expect(body!.messages).toEqual([{ role: 'user', content: 'the-user-message' }]);
  });

  it('prefers a per-model baseUrl over the AZURE_FOUNDRY_ANTHROPIC_ENDPOINT env var', async () => {
    process.env.AZURE_FOUNDRY_ANTHROPIC_ENDPOINT = 'https://env-host.services.ai.azure.com/anthropic';
    let hit: string | null = null;
    server.use(
      http.post('https://per-model.services.ai.azure.com/anthropic/v1/messages', ({ request }) => {
        hit = request.url;
        return textResponse('from per-model');
      }),
      http.post('https://env-host.services.ai.azure.com/anthropic/v1/messages', () =>
        textResponse('from env (should not hit)'),
      ),
    );
    const out = await callAzureFoundryAnthropic('s', 'm', {
      ...baseModel,
      baseUrl: 'https://per-model.services.ai.azure.com/anthropic',
    });
    expect(out).toBe('from per-model');
    expect(hit).toBe('https://per-model.services.ai.azure.com/anthropic/v1/messages');
  });

  it('tolerates a trailing slash on the configured endpoint', async () => {
    process.env.AZURE_FOUNDRY_ANTHROPIC_ENDPOINT = `${ENDPOINT}/`;
    server.use(http.post(MESSAGES_URL, () => textResponse('ok')));
    await expect(callAzureFoundryAnthropic('s', 'm', baseModel)).resolves.toBe('ok');
  });

  it('throws UpstreamError(auth_failed) when the credential cannot issue a token', async () => {
    getTokenMock.mockRejectedValueOnce(new Error('chained credential failed: leaked-creds-canary'));
    let thrown: unknown;
    try {
      await callAzureFoundryAnthropic('s', 'm', baseModel);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(UpstreamError);
    const err = thrown as UpstreamError;
    expect(err.code).toBe('auth_failed');
    expect(JSON.stringify(err)).not.toContain('leaked-creds-canary');
  });

  it('throws UpstreamError(auth_failed) when getToken resolves to null', async () => {
    getTokenMock.mockResolvedValueOnce(null);
    await expect(callAzureFoundryAnthropic('s', 'm', baseModel)).rejects.toMatchObject({
      name: 'UpstreamError',
      code: 'auth_failed',
    });
  });

  it('maps a 401 from Foundry to UpstreamError(auth_failed)', async () => {
    server.use(http.post(MESSAGES_URL, () => new HttpResponse('unauthorized', { status: 401 })));
    await expect(callAzureFoundryAnthropic('s', 'm', baseModel)).rejects.toMatchObject({
      name: 'UpstreamError',
      code: 'auth_failed',
      status: 401,
    });
  });

  it('maps a 404 (deployment not found) to UpstreamError(not_found)', async () => {
    server.use(http.post(MESSAGES_URL, () => new HttpResponse('deployment not found', { status: 404 })));
    await expect(callAzureFoundryAnthropic('s', 'm', baseModel)).rejects.toMatchObject({
      name: 'UpstreamError',
      code: 'not_found',
      status: 404,
    });
  });

  it('throws UpstreamError(upstream_4xx) on a non-retriable 4xx without embedding the body', async () => {
    const canary = 'leaked-prompt-fragment-CANARY-z9q4';
    server.use(http.post(MESSAGES_URL, () => new HttpResponse(canary, { status: 400 })));
    let thrown: unknown;
    try {
      await callAzureFoundryAnthropic('s', 'm', baseModel);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(UpstreamError);
    const err = thrown as UpstreamError;
    expect(err.code).toBe('upstream_4xx');
    expect(err.status).toBe(400);
    expect(err.message).not.toContain(canary);
    expect(JSON.stringify(err)).not.toContain(canary);
  });

  it('throws UpstreamError(upstream_5xx) on a 500', async () => {
    server.use(http.post(MESSAGES_URL, () => new HttpResponse('boom', { status: 500 })));
    await expect(callAzureFoundryAnthropic('s', 'm', baseModel)).rejects.toMatchObject({
      name: 'UpstreamError',
      code: 'upstream_5xx',
      status: 500,
    });
  });

  it('throws UpstreamError(parse_failed) when the response carries no text block', async () => {
    server.use(http.post(MESSAGES_URL, () => HttpResponse.json({ content: [] })));
    await expect(callAzureFoundryAnthropic('s', 'm', baseModel)).rejects.toMatchObject({
      name: 'UpstreamError',
      code: 'parse_failed',
    });
  });

  it('retries on 429 then succeeds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let attempts = 0;
    server.use(
      http.post(MESSAGES_URL, () => {
        attempts += 1;
        if (attempts < 2) return new HttpResponse('rate limited', { status: 429 });
        return textResponse('after-retry');
      }),
    );
    const promise = callAzureFoundryAnthropic('s', 'm', baseModel);
    await vi.advanceTimersByTimeAsync(1100);
    const result = await promise;
    expect(result).toBe('after-retry');
    expect(attempts).toBe(2);
  });

  it('gives up after the last retry with UpstreamError(rate_limited)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    server.use(http.post(MESSAGES_URL, () => new HttpResponse('429', { status: 429 })));
    const assertion = expect(callAzureFoundryAnthropic('s', 'm', baseModel)).rejects.toMatchObject({
      name: 'UpstreamError',
      code: 'rate_limited',
      status: 429,
    });
    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;
  });
});
