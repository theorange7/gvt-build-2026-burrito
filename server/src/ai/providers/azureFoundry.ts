/*
 * PRIVACY: Forwards request bodies to an Azure AI Foundry OpenAI deployment
 * via @azure/ai-projects' getAzureOpenAIClient. Auth uses
 * DefaultAzureCredential; we never read or surface SDK error message bodies.
 */
import { AIProjectClient } from '@azure/ai-projects';
import { DefaultAzureCredential } from '@azure/identity';
import type { AzureOpenAI } from 'openai';
import type { ModelOption } from '../models';
import { UpstreamError } from '../../privacy';
import type { ProviderAdapter } from './types';
import { RETRY_DELAYS, sleep } from './shared';

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

export const callAzureFoundry: ProviderAdapter = async (systemPrompt, userMessage, model) => {
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
};
