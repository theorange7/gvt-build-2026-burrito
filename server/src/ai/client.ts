/*
 * PRIVACY: This module forwards request bodies to upstream AI providers
 * (Anthropic, Azure Foundry) without persistence. Do not add request-body
 * logging here. Only error status codes and messages may be logged.
 */
import { AIProjectClient } from '@azure/ai-projects';
import { DefaultAzureCredential } from '@azure/identity';
import type { AzureOpenAI } from 'openai';
import { resolveModel, type ModelOption } from './models';
import { UpstreamError } from '../privacy';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const RETRY_DELAYS = [1000, 2000, 4000];

export async function callModel(
  systemPrompt: string,
  userMessage: string,
  modelId?: string,
): Promise<string> {
  const model = resolveModel(modelId);
  if (model.provider === 'azure-foundry') {
    return callAzureFoundry(systemPrompt, userMessage, model);
  }
  return callAnthropic(systemPrompt, userMessage, model);
}

/**
 * @deprecated Use callModel. Retained for older callers (notably classify.ts
 * and the unit-test suite) that historically targeted Anthropic directly.
 * Always hits the Anthropic provider regardless of the configured default
 * model, so MSW-mocked tests remain stable.
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

async function callAnthropic(
  systemPrompt: string,
  userMessage: string,
  model: ModelOption,
): Promise<string> {
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
}

const azureClientsByApiVersion = new Map<string, Promise<AzureOpenAI>>();

function getAzureOpenAIClient(model: ModelOption): Promise<AzureOpenAI> {
  const projectEndpoint = process.env.AZURE_FOUNDRY_PROJECT_ENDPOINT;
  if (!projectEndpoint) {
    throw new UpstreamError('config_missing');
  }

  const apiVersion = model.version ?? process.env.AZURE_FOUNDRY_API_VERSION ?? '2025-10-01';
  const cached = azureClientsByApiVersion.get(apiVersion);
  if (cached) return cached;

  const project = new AIProjectClient(projectEndpoint, new DefaultAzureCredential());
  const pending = project.getAzureOpenAIClient({ apiVersion });
  azureClientsByApiVersion.set(apiVersion, pending);
  return pending;
}

async function callAzureFoundry(
  systemPrompt: string,
  userMessage: string,
  model: ModelOption,
): Promise<string> {
  const openai = await getAzureOpenAIClient(model);

  let lastError: UpstreamError | null = null;

  for (const [index, delay] of RETRY_DELAYS.entries()) {
    try {
      const response = await openai.chat.completions.create({
        ...model.parameters,
        model: model.modelId,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
      });

      const text = response.choices?.[0]?.message?.content;
      if (!text) {
        throw new UpstreamError('parse_failed');
      }
      return text;
    } catch (error) {
      // Re-throw our own errors unchanged.
      if (error instanceof UpstreamError) throw error;

      const status = (error as { status?: number; statusCode?: number }).status
        ?? (error as { statusCode?: number }).statusCode;

      // openai's APIError exposes `.status` and embeds the upstream response
      // body in `.message`. We deliberately do not read or include `.message`,
      // `.headers`, or `.request_id` — anything keyed on those should be
      // looked up via App Insights' request correlation, not this thrown error.
      if (status === 429 || (typeof status === 'number' && status >= 500)) {
        lastError = new UpstreamError(status === 429 ? 'rate_limited' : 'upstream_5xx', status);
        if (index < RETRY_DELAYS.length - 1) {
          await sleep(delay);
          continue;
        }
      }
      if (status === 408 || status === 504) {
        throw new UpstreamError('upstream_timeout', status);
      }
      if (status === 401 || status === 403) {
        throw new UpstreamError('auth_failed', status);
      }
      if (status === 404) {
        throw new UpstreamError('not_found', status);
      }
      throw new UpstreamError('upstream_4xx', typeof status === 'number' ? status : undefined);
    }
  }

  throw lastError ?? new UpstreamError('rate_limited');
}
