import { z } from 'zod';

const RESPONSE_SCHEMA = z.object({
  content: z.array(
    z.object({
      type: z.string(),
      text: z.string().optional(),
    }),
  ).optional(),
});

const RETRYABLE_STATUS_CODES = new Set([429, 529]);
const RETRY_DELAYS_MS = [1000, 2000, 4000] as const;
const REQUEST_TIMEOUT_MS = 15000;

export async function callClaude(systemPrompt: string, userMessage: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set. Add it to .env.local before generating a wrap.');
  }

  const payload = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  };

  let lastError: Error | null = null;

  for (const [index, delay] of RETRY_DELAYS_MS.entries()) {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (response.ok) {
        const parsed = RESPONSE_SCHEMA.safeParse(await response.json());

        if (!parsed.success) {
          throw new Error('Anthropic returned an unexpected response shape.');
        }

        const text = parsed.data.content?.find((item) => item.type === 'text')?.text;
        if (!text) {
          throw new Error('Anthropic returned no text content in the first response block.');
        }

        return text;
      }

      const body = await response.text();

      if (RETRYABLE_STATUS_CODES.has(response.status)) {
        lastError = new Error(`Anthropic transient error ${response.status}: ${body}`);
        if (index < RETRY_DELAYS_MS.length - 1) {
          await sleep(delay);
          continue;
        }
      }

      throw new Error(`Anthropic API error ${response.status}: ${body}`);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Anthropic request failed.');

      if (index < RETRY_DELAYS_MS.length - 1 && isRetryableNetworkError(lastError)) {
        await sleep(delay);
        continue;
      }

      throw lastError;
    }
  }

  throw lastError ?? new Error('Anthropic request failed after retries.');
}

function isRetryableNetworkError(error: Error) {
  return error.name === 'AbortError' || error instanceof TypeError;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
