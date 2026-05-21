/*
 * PRIVACY: Forwards request bodies to a Claude deployment on Azure AI Foundry
 * via the Anthropic Messages API ({endpoint}/v1/messages). Auth uses an Entra
 * ID bearer token from DefaultAzureCredential. Errors collapse to UpstreamError
 * codes only — never the upstream response body, never the bearer token, never
 * request headers or the Foundry/Anthropic correlation request-id.
 */
import { DefaultAzureCredential } from '@azure/identity';
import { UpstreamError } from '../../privacy';
import type { ProviderAdapter } from './types';
import { RETRY_DELAYS, sleep } from './shared';

// Cognitive Services is the resource provider that fronts Foundry deployments;
// this is the scope Entra ID issues Foundry-usable access tokens for.
const ENTRA_SCOPE = 'https://cognitiveservices.azure.com/.default';

// Messages API version. Deliberately a constant, not the model's Azure
// `version` field — that field is an Azure OpenAI api-version and is
// meaningless on the Anthropic path, which keys off this header instead.
const ANTHROPIC_VERSION = '2023-06-01';

let cachedCredential: DefaultAzureCredential | undefined;
function credential(): DefaultAzureCredential {
  cachedCredential ??= new DefaultAzureCredential();
  return cachedCredential;
}

function resolveEndpoint(model: { baseUrl?: string }): string {
  const raw = model.baseUrl ?? process.env.AZURE_FOUNDRY_ANTHROPIC_ENDPOINT;
  if (!raw) throw new UpstreamError('config_missing');
  // Operator supplies the `.../anthropic` base; we append the Messages path.
  return raw.replace(/\/+$/, '');
}

async function bearerToken(): Promise<string> {
  try {
    const token = await credential().getToken(ENTRA_SCOPE);
    if (token?.token) return token.token;
  } catch {
    // DefaultAzureCredential embeds the chained-credential failure detail in
    // the message; we deliberately drop it and report only the code.
  }
  throw new UpstreamError('auth_failed');
}

export const callAzureFoundryAnthropic: ProviderAdapter = async (
  systemPrompt,
  userMessage,
  model,
) => {
  const endpoint = resolveEndpoint(model);
  const token = await bearerToken();

  const payload = {
    max_tokens: 1024,
    ...model.parameters,
    // `model` is the Foundry deployment name, not the model family.
    model: model.modelId,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  };

  let lastError: UpstreamError | null = null;

  for (const [index, delay] of RETRY_DELAYS.entries()) {
    const response = await fetch(`${endpoint}/v1/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      const data = (await response.json()) as {
        content?: Array<{ type: string; text?: string }>;
      };
      const text = data.content?.find((item) => item.type === 'text')?.text;
      if (!text) throw new UpstreamError('parse_failed');
      return text;
    }

    // We deliberately don't read response.text() — the upstream body can carry
    // prompt fragments and correlation request-ids that would land verbatim in
    // the thrown error and, by extension, in App Insights.
    if (response.status === 429 || response.status === 529) {
      lastError = new UpstreamError('rate_limited', response.status);
      if (index < RETRY_DELAYS.length - 1) {
        await sleep(delay);
        continue;
      }
      throw lastError;
    }

    if (response.status >= 500) throw new UpstreamError('upstream_5xx', response.status);
    if (response.status === 408 || response.status === 504) {
      throw new UpstreamError('upstream_timeout', response.status);
    }
    if (response.status === 401 || response.status === 403) {
      throw new UpstreamError('auth_failed', response.status);
    }
    if (response.status === 404) throw new UpstreamError('not_found', response.status);
    throw new UpstreamError('upstream_4xx', response.status);
  }

  throw lastError ?? new UpstreamError('rate_limited');
};
