import { z } from 'zod';

const ANTHROPIC_RESPONSE_SCHEMA = z.object({
  content: z
    .array(
      z.object({
        type: z.string(),
        text: z.string().optional(),
      }),
    )
    .optional(),
});

const AZURE_FOUNDRY_RESPONSE_SCHEMA = z.object({
  choices: z
    .array(
      z.object({
        message: z
          .object({
            content: z.unknown().optional(),
          })
          .optional(),
      }),
    )
    .optional(),
});

export type AiProvider = 'anthropic' | 'azure-foundry';

const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504, 529]);
const RETRY_DELAYS_MS = [1000, 2000, 4000] as const;
const REQUEST_TIMEOUT_MS = 15000;
const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-4-20250514';
const DEFAULT_AZURE_FOUNDRY_API_VERSION = '2024-05-01-preview';

export function getAiProvider(): AiProvider {
  const configuredProvider = process.env.AI_PROVIDER?.trim().toLowerCase();

  if (!configuredProvider) {
    if (
      process.env.AZURE_FOUNDRY_API_KEY &&
      process.env.AZURE_FOUNDRY_ENDPOINT &&
      !process.env.ANTHROPIC_API_KEY
    ) {
      return 'azure-foundry';
    }

    return 'anthropic';
  }

  if (configuredProvider === 'anthropic') {
    return 'anthropic';
  }

  if (
    configuredProvider === 'azure-foundry' ||
    configuredProvider === 'azure_foundry' ||
    configuredProvider === 'azure' ||
    configuredProvider === 'foundry'
  ) {
    return 'azure-foundry';
  }

  throw new Error(
    `Unsupported AI_PROVIDER value "${process.env.AI_PROVIDER}". Use "anthropic" or "azure-foundry".`,
  );
}

export async function callModel(systemPrompt: string, userMessage: string): Promise<string> {
  const provider = getAiProvider();

  if (provider === 'azure-foundry') {
    return callAzureFoundry(systemPrompt, userMessage);
  }

  return callAnthropic(systemPrompt, userMessage);
}

export async function callClaude(systemPrompt: string, userMessage: string): Promise<string> {
  return callModel(systemPrompt, userMessage);
}

async function callAnthropic(systemPrompt: string, userMessage: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set. Add it to .env.local before generating a wrap.');
  }

  return requestTextCompletion({
    providerLabel: 'Anthropic',
    url: 'https://api.anthropic.com/v1/messages',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    payload: {
      model: process.env.ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    },
    parseResponse: parseAnthropicResponse,
  });
}

async function callAzureFoundry(systemPrompt: string, userMessage: string): Promise<string> {
  const apiKey = process.env.AZURE_FOUNDRY_API_KEY;
  const endpoint = process.env.AZURE_FOUNDRY_ENDPOINT;

  if (!apiKey) {
    throw new Error(
      'AZURE_FOUNDRY_API_KEY is not set. Add it to .env.local before generating a wrap with Azure Foundry.',
    );
  }

  if (!endpoint) {
    throw new Error(
      'AZURE_FOUNDRY_ENDPOINT is not set. Add it to .env.local before generating a wrap with Azure Foundry.',
    );
  }

  const payload: Record<string, unknown> = {
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    max_tokens: 1024,
  };

  if (process.env.AZURE_FOUNDRY_MODEL) {
    payload.model = process.env.AZURE_FOUNDRY_MODEL;
  }

  return requestTextCompletion({
    providerLabel: 'Azure Foundry',
    url: buildAzureFoundryUrl(
      endpoint,
      process.env.AZURE_FOUNDRY_API_VERSION || DEFAULT_AZURE_FOUNDRY_API_VERSION,
    ),
    headers: {
      'content-type': 'application/json',
      'api-key': apiKey,
    },
    payload,
    parseResponse: parseAzureFoundryResponse,
  });
}

async function requestTextCompletion(args: {
  providerLabel: string;
  url: string;
  headers: Record<string, string>;
  payload: Record<string, unknown>;
  parseResponse: (json: unknown) => string;
}): Promise<string> {
  let lastError: Error | null = null;

  for (const [index, delay] of RETRY_DELAYS_MS.entries()) {
    try {
      const response = await fetch(args.url, {
        method: 'POST',
        headers: args.headers,
        body: JSON.stringify(args.payload),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (response.ok) {
        return args.parseResponse(await response.json());
      }

      const body = await response.text();

      if (RETRYABLE_STATUS_CODES.has(response.status)) {
        lastError = new Error(`${args.providerLabel} transient error ${response.status}: ${body}`);
        if (index < RETRY_DELAYS_MS.length - 1) {
          await sleep(delay);
          continue;
        }
      }

      throw new Error(`${args.providerLabel} API error ${response.status}: ${body}`);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(`${args.providerLabel} request failed.`);

      if (index < RETRY_DELAYS_MS.length - 1 && isRetryableNetworkError(lastError)) {
        await sleep(delay);
        continue;
      }

      throw lastError;
    }
  }

  throw lastError ?? new Error('AI request failed after retries.');
}

function parseAnthropicResponse(json: unknown): string {
  const parsed = ANTHROPIC_RESPONSE_SCHEMA.safeParse(json);

  if (!parsed.success) {
    throw new Error('Anthropic returned an unexpected response shape.');
  }

  const text = parsed.data.content?.find((item) => item.type === 'text')?.text?.trim();

  if (!text) {
    throw new Error('Anthropic returned no text content in the first response block.');
  }

  return text;
}

function parseAzureFoundryResponse(json: unknown): string {
  const parsed = AZURE_FOUNDRY_RESPONSE_SCHEMA.safeParse(json);

  if (!parsed.success) {
    throw new Error('Azure Foundry returned an unexpected response shape.');
  }

  const text = extractAzureFoundryText(parsed.data.choices?.[0]?.message?.content);

  if (!text) {
    throw new Error('Azure Foundry returned no text content in the first choice.');
  }

  return text;
}

function extractAzureFoundryText(content: unknown): string | null {
  if (typeof content === 'string') {
    const trimmed = content.trim();
    return trimmed || null;
  }

  if (!Array.isArray(content)) {
    return null;
  }

  const segments = content
    .map((item) => {
      if (typeof item === 'string') {
        return item;
      }

      if (!item || typeof item !== 'object') {
        return null;
      }

      const text = Reflect.get(item, 'text');
      if (typeof text === 'string') {
        return text;
      }

      if (text && typeof text === 'object') {
        const value = Reflect.get(text, 'value');
        return typeof value === 'string' ? value : null;
      }

      return null;
    })
    .filter((value): value is string => Boolean(value && value.trim()))
    .join('\n')
    .trim();

  return segments || null;
}

export function buildAzureFoundryUrl(rawEndpoint: string, apiVersion: string): string {
  let url: URL;

  try {
    url = new URL(rawEndpoint);
  } catch {
    throw new Error('AZURE_FOUNDRY_ENDPOINT must be a valid URL.');
  }

  url.search = '';

  let pathname = url.pathname.replace(/\/+$/, '');

  if (pathname.endsWith('/chat/completions')) {
    pathname = pathname.slice(0, -'/chat/completions'.length);
  }

  if (!pathname.endsWith('/models')) {
    pathname = `${pathname}/models`;
  }

  url.pathname = `${pathname.replace(/\/{2,}/g, '/').replace(/\/+$/, '')}/chat/completions`;
  url.searchParams.set('api-version', apiVersion);

  return url.toString();
}

function isRetryableNetworkError(error: Error) {
  return error.name === 'AbortError' || error instanceof TypeError;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
