// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildAzureFoundryUrl, callClaude, getAiProvider } from './client';

const ORIGINAL_ENV = { ...process.env };

describe('AI client provider support', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = {
      ...ORIGINAL_ENV,
      AI_PROVIDER: 'anthropic',
      ANTHROPIC_API_KEY: 'test-key',
      ANTHROPIC_MODEL: 'claude-test-model',
    };
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('defaults to Anthropic when no provider is set', () => {
    delete process.env.AI_PROVIDER;
    delete process.env.AZURE_FOUNDRY_API_KEY;
    delete process.env.AZURE_FOUNDRY_ENDPOINT;

    expect(getAiProvider()).toBe('anthropic');
  });

  it('infers Azure Foundry when only Azure credentials are present', () => {
    delete process.env.AI_PROVIDER;
    delete process.env.ANTHROPIC_API_KEY;
    process.env.AZURE_FOUNDRY_API_KEY = 'azure-key';
    process.env.AZURE_FOUNDRY_ENDPOINT = 'https://workspace.services.ai.azure.com';

    expect(getAiProvider()).toBe('azure-foundry');
  });

  it('throws when the Anthropic API key is missing', async () => {
    delete process.env.ANTHROPIC_API_KEY;

    await expect(callClaude('system', 'message')).rejects.toThrow(/ANTHROPIC_API_KEY/);
  });

  it('returns the first Anthropic text block on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content: [{ type: 'text', text: 'hello world' }] }),
    });

    vi.stubGlobal('fetch', fetchMock);

    await expect(callClaude('system', 'message')).resolves.toBe('hello world');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages',
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-api-key': 'test-key',
        }),
      }),
    );
  });

  it('retries transient Anthropic errors before succeeding', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 429, text: async () => 'rate limited' })
      .mockResolvedValueOnce({ ok: false, status: 529, text: async () => 'overloaded' })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ content: [{ type: 'text', text: 'recovered' }] }),
      });

    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal(
      'setTimeout',
      vi.fn((callback: TimerHandler) => {
        if (typeof callback === 'function') {
          callback();
        }
        return 0 as unknown as ReturnType<typeof setTimeout>;
      }),
    );

    await expect(callClaude('system', 'message')).resolves.toBe('recovered');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('throws when the Anthropic response has no text content', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ content: [{ type: 'tool_use' }] }),
      }),
    );

    await expect(callClaude('system', 'message')).rejects.toThrow(/no text content/i);
  });

  it('supports Azure Foundry when the provider is selected explicitly', async () => {
    process.env.AI_PROVIDER = 'azure-foundry';
    process.env.AZURE_FOUNDRY_API_KEY = 'azure-key';
    process.env.AZURE_FOUNDRY_ENDPOINT = 'https://workspace.services.ai.azure.com';
    process.env.AZURE_FOUNDRY_MODEL = 'gpt-4o-mini';

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'azure response text' } }],
      }),
    });

    vi.stubGlobal('fetch', fetchMock);

    await expect(callClaude('system prompt', 'user prompt')).resolves.toBe('azure response text');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://workspace.services.ai.azure.com/models/chat/completions?api-version=2024-05-01-preview',
      expect.objectContaining({
        headers: expect.objectContaining({
          'api-key': 'azure-key',
        }),
      }),
    );

    const requestInit = fetchMock.mock.calls[0]?.[1];
    const payload = JSON.parse(String(requestInit?.body));

    expect(payload).toMatchObject({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'system prompt' },
        { role: 'user', content: 'user prompt' },
      ],
    });
  });

  it('accepts an Azure Foundry endpoint that already points at chat completions', async () => {
    process.env.AI_PROVIDER = 'azure';
    process.env.AZURE_FOUNDRY_API_KEY = 'azure-key';
    process.env.AZURE_FOUNDRY_ENDPOINT =
      'https://workspace.services.ai.azure.com/models/chat/completions?api-version=old-version';
    process.env.AZURE_FOUNDRY_API_VERSION = '2024-05-01-preview';

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: [{ type: 'text', text: 'already normalized' }] } }],
        }),
      }),
    );

    await expect(callClaude('system', 'message')).resolves.toBe('already normalized');
  });

  it('throws when Azure Foundry is selected but its configuration is missing', async () => {
    process.env.AI_PROVIDER = 'azure-foundry';
    delete process.env.AZURE_FOUNDRY_API_KEY;
    delete process.env.AZURE_FOUNDRY_ENDPOINT;

    await expect(callClaude('system', 'message')).rejects.toThrow(/AZURE_FOUNDRY_API_KEY/);
  });

  it('normalizes Azure Foundry endpoints into the chat completions URL', () => {
    expect(
      buildAzureFoundryUrl('https://workspace.services.ai.azure.com', '2024-05-01-preview'),
    ).toBe('https://workspace.services.ai.azure.com/models/chat/completions?api-version=2024-05-01-preview');

    expect(
      buildAzureFoundryUrl(
        'https://workspace.services.ai.azure.com/models/chat/completions?api-version=legacy',
        '2024-05-01-preview',
      ),
    ).toBe('https://workspace.services.ai.azure.com/models/chat/completions?api-version=2024-05-01-preview');
  });
});
