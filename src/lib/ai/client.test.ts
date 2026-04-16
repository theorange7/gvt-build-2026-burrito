// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { callClaude } from './client';

describe('callClaude', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.ANTHROPIC_API_KEY = 'test-key';
  });

  it('throws when the API key is missing', async () => {
    delete process.env.ANTHROPIC_API_KEY;

    await expect(callClaude('system', 'message')).rejects.toThrow(/ANTHROPIC_API_KEY/);
  });

  it('returns the first text block on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ content: [{ type: 'text', text: 'hello world' }] }),
      }),
    );

    await expect(callClaude('system', 'message')).resolves.toBe('hello world');
  });

  it('retries transient errors before succeeding', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 429, text: async () => 'rate limited' })
      .mockResolvedValueOnce({ ok: false, status: 529, text: async () => 'overloaded' })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ content: [{ type: 'text', text: 'recovered' }] }),
      });

    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('setTimeout', vi.fn((callback: TimerHandler) => {
      if (typeof callback === 'function') {
        callback();
      }
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }));

    await expect(callClaude('system', 'message')).resolves.toBe('recovered');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('throws when the response has no text content', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ content: [{ type: 'tool_use' }] }),
      }),
    );

    await expect(callClaude('system', 'message')).rejects.toThrow(/no text content/i);
  });
});
