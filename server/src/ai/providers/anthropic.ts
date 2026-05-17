/*
 * PRIVACY: Forwards request bodies to api.anthropic.com without persistence.
 * Errors collapse to UpstreamError codes only — never the upstream body, never
 * the api key, never request headers.
 */
import type { ModelOption } from '../models';
import { UpstreamError } from '../../privacy';
import type { ProviderAdapter } from './types';
import { RETRY_DELAYS, sleep } from './shared';

export const callAnthropic: ProviderAdapter = async (systemPrompt, userMessage, model) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new UpstreamError('config_missing');
  }

  const payload = {
    max_tokens: 1024,
    ...model.parameters,
    model: model.modelId,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  };

  let lastError: UpstreamError | null = null;

  for (const [index, delay] of RETRY_DELAYS.entries()) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      const data = (await response.json()) as {
        content?: Array<{ type: string; text?: string }>;
      };
      const text = data.content?.find((item) => item.type === 'text')?.text;
      if (!text) {
        // Drain the body so connection-reuse isn't blocked, but never log it.
        throw new UpstreamError('parse_failed');
      }
      return text;
    }

    // We deliberately don't read response.text() — the upstream body can carry
    // prompt fragments or request-IDs that would land verbatim in the thrown
    // error and, by extension, in App Insights. The allowlisted code is
    // sufficient for routing.
    if (response.status === 429 || response.status === 529) {
      lastError = new UpstreamError('rate_limited', response.status);
      if (index < RETRY_DELAYS.length - 1) {
        await sleep(delay);
        continue;
      }
    }

    if (response.status >= 500) throw new UpstreamError('upstream_5xx', response.status);
    if (response.status === 408 || response.status === 504) {
      throw new UpstreamError('upstream_timeout', response.status);
    }
    if (response.status === 401 || response.status === 403) {
      throw new UpstreamError('auth_failed', response.status);
    }
    throw new UpstreamError('upstream_4xx', response.status);
  }

  throw lastError ?? new UpstreamError('rate_limited');
};

/**
 * @deprecated Use callModel. Retained for older callers (notably classify.ts
 * and the unit-test suite) that historically targeted Anthropic directly.
 */
const ANTHROPIC_FALLBACK_MODEL: ModelOption = {
  id: 'anthropic:fallback',
  label: 'Anthropic fallback',
  provider: 'anthropic',
  modelId: 'claude-sonnet-4-20250514',
  parameters: { max_tokens: 1024 },
};

export const callClaude = (systemPrompt: string, userMessage: string) =>
  callAnthropic(systemPrompt, userMessage, ANTHROPIC_FALLBACK_MODEL);
