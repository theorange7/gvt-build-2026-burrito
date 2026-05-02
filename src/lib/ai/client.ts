/*
 * PRIVACY: This module forwards request bodies to upstream AI providers
 * (Anthropic, Azure Foundry) without persistence. Do not add request-body
 * logging here. Only error status codes and messages may be logged.
 */
import { AIProjectClient } from '@azure/ai-projects';
import { DefaultAzureCredential } from '@azure/identity';
import type { AzureOpenAI } from 'openai';
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

let cachedOpenAIClient: Promise<AzureOpenAI> | null = null;

function getAzureOpenAIClient(model: ModelOption): Promise<AzureOpenAI> {
  if (cachedOpenAIClient) return cachedOpenAIClient;

  const projectEndpoint = process.env.AZURE_FOUNDRY_PROJECT_ENDPOINT;
  if (!projectEndpoint) {
    throw new Error(
      'AZURE_FOUNDRY_PROJECT_ENDPOINT is not set. Add it to .env.local to use Azure Foundry models. ' +
        'Format: https://<account>.services.ai.azure.com/api/projects/<project>',
    );
  }

  const apiVersion = model.version ?? process.env.AZURE_FOUNDRY_API_VERSION ?? '2025-10-01';
  const project = new AIProjectClient(projectEndpoint, new DefaultAzureCredential());
  const pending = project.getAzureOpenAIClient({ apiVersion });
  cachedOpenAIClient = pending;
  return pending;
}

async function callAzureFoundry(
  systemPrompt: string,
  userMessage: string,
  model: ModelOption,
): Promise<string> {
  const openai = await getAzureOpenAIClient(model);

  let lastError: Error | null = null;

  for (const [index, delay] of RETRY_DELAYS.entries()) {
    try {
      const response = await openai.chat.completions.create({
        model: model.modelId,
        temperature: 1.0,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
      });

      const text = response.choices?.[0]?.message?.content;
      if (!text) {
        throw new Error('Azure Foundry returned no message content.');
      }
      return text;
    } catch (error) {
      const status = (error as { status?: number; statusCode?: number }).status
        ?? (error as { statusCode?: number }).statusCode;
      const message = error instanceof Error ? error.message : String(error);

      if (status === 429 || (typeof status === 'number' && status >= 500)) {
        lastError = new Error(`Azure Foundry transient error ${status}: ${message}`);
        if (index < RETRY_DELAYS.length - 1) {
          await sleep(delay);
          continue;
        }
      }

      const hint =
        status === 404
          ? ` Verify that "${model.modelId}" is the exact deployment name in your Foundry project and that AZURE_FOUNDRY_API_VERSION (currently using a default of 2025-01-01-preview) is supported by that deployment.`
          : '';
      throw new Error(`Azure Foundry API error${status ? ` ${status}` : ''}: ${message}${hint}`);
    }
  }

  throw lastError ?? new Error('Azure Foundry request failed after retries.');
}
