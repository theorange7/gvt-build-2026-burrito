/*
 * PRIVACY: This module forwards request bodies to Anthropic without persistence.
 * Do not add request-body logging here. Only error status codes and messages
 * may be logged.
 */
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

  for (const [index, delay] of [1000, 2000, 4000].entries()) {
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
      if (index < 2) {
        await sleep(delay);
        continue;
      }
    }

    throw new Error(`Anthropic API error ${response.status}: ${body}`);
  }

  throw lastError ?? new Error('Anthropic request failed after retries.');
}
