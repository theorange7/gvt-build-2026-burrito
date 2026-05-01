/*
 * PRIVACY: This module forwards request bodies to upstream AI providers
 * (Anthropic, Azure Foundry) without persistence. Do not add request-body
 * logging here. Only error status codes and messages may be logged.
 */
import { resolveModel, type ModelOption } from './models';

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

/** @deprecated Use callModel. Retained for any older imports. */
export const callClaude = (systemPrompt: string, userMessage: string) =>
  callModel(systemPrompt, userMessage);

async function callAnthropic(
  systemPrompt: string,
  userMessage: string,
  model: ModelOption,
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set. Add it to .env.local before generating a wrap.');
  }

  const payload = {
    model: model.modelId,
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  };

  let lastError: Error | null = null;

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
        throw new Error('Anthropic returned no text content in the first response block.');
      }
      return text;
    }

    const body = await response.text();
    if (response.status === 429 || response.status === 529) {
      lastError = new Error(`Anthropic transient error ${response.status}: ${body}`);
      if (index < RETRY_DELAYS.length - 1) {
        await sleep(delay);
        continue;
      }
    }

    throw new Error(`Anthropic API error ${response.status}: ${body}`);
  }

  throw lastError ?? new Error('Anthropic request failed after retries.');
}

async function callAzureFoundry(
  systemPrompt: string,
  userMessage: string,
  model: ModelOption,
): Promise<string> {
  const endpoint = process.env.AZURE_FOUNDRY_ENDPOINT;
  const apiKey = process.env.AZURE_FOUNDRY_API_KEY;
  const apiVersion = process.env.AZURE_FOUNDRY_API_VERSION ?? '2024-05-01-preview';

  if (!endpoint) {
    throw new Error('AZURE_FOUNDRY_ENDPOINT is not set. Add it to .env.local to use Azure Foundry models.');
  }
  if (!apiKey) {
    throw new Error('AZURE_FOUNDRY_API_KEY is not set. Add it to .env.local to use Azure Foundry models.');
  }

  const url = buildAzureUrl(endpoint, apiVersion);

  const payload = {
    model: model.modelId,
    max_tokens: 1024,
    temperature: 0.7,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
  };

  let lastError: Error | null = null;

  for (const [index, delay] of RETRY_DELAYS.entries()) {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'api-key': apiKey,
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const text = data.choices?.[0]?.message?.content;
      if (!text) {
        throw new Error('Azure Foundry returned no message content.');
      }
      return text;
    }

    const body = await response.text();
    if (response.status === 429 || response.status >= 500) {
      lastError = new Error(`Azure Foundry transient error ${response.status}: ${body}`);
      if (index < RETRY_DELAYS.length - 1) {
        await sleep(delay);
        continue;
      }
    }

    throw new Error(`Azure Foundry API error ${response.status}: ${body}`);
  }

  throw lastError ?? new Error('Azure Foundry request failed after retries.');
}

function buildAzureUrl(endpoint: string, apiVersion: string): string {
  const trimmed = endpoint.replace(/\/+$/, '');
  if (/\/chat\/completions(\?|$)/.test(trimmed)) {
    return trimmed.includes('api-version=') ? trimmed : `${trimmed}?api-version=${apiVersion}`;
  }
  return `${trimmed}/models/chat/completions?api-version=${apiVersion}`;
}
