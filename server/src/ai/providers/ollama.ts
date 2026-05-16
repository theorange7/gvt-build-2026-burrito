/*
 * PRIVACY: Forwards request bodies to a local-or-LAN Ollama instance. No
 * Authorization header is sent (Ollama is unauthenticated by design). The
 * configured baseUrl may surface in user-facing 503 hints, but never in logs
 * and never in the thrown error for non-`ollama_unreachable` codes — see
 * No-gos in tasks/60-ollama-local-provider.md.
 */
import { UpstreamError } from '../../privacy';
import type { ProviderAdapter } from './types';
import { RETRY_DELAYS, sleep } from './shared';

const DEFAULT_BASE_URL = 'http://localhost:11434';

function resolveBaseUrl(model: { baseUrl?: string }): string {
  return model.baseUrl ?? process.env.OLLAMA_BASE_URL ?? DEFAULT_BASE_URL;
}

export const callOllama: ProviderAdapter = async (systemPrompt, userMessage, model) => {
  const baseUrl = resolveBaseUrl(model);

  const payload = {
    model: model.modelId,
    stream: false,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    options: model.parameters ?? {},
  };

  let lastError: UpstreamError | null = null;

  for (const [index, delay] of RETRY_DELAYS.entries()) {
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch {
      // Connection refused / DNS failure / abort — Ollama not running.
      throw new UpstreamError(
        'ollama_unreachable',
        undefined,
        `Ollama isn't reachable at ${baseUrl}. Start it with \`ollama serve\` and pull the model.`,
      );
    }

    if (response.ok) {
      const data = (await response.json()) as {
        message?: { content?: string };
      };
      const text = data.message?.content;
      if (!text) throw new UpstreamError('parse_failed');
      return text;
    }

    if (response.status === 404) {
      // Model isn't pulled. Name the modelId so the operator knows what to
      // pull; do NOT include the upstream response body.
      throw new UpstreamError(
        'not_found',
        404,
        `Ollama model not found. Run \`ollama pull ${model.modelId}\` on the host.`,
      );
    }

    if (response.status === 429 || response.status >= 500) {
      lastError = new UpstreamError(
        response.status === 429 ? 'rate_limited' : 'upstream_5xx',
        response.status,
      );
      if (index < RETRY_DELAYS.length - 1) {
        await sleep(delay);
        continue;
      }
      throw lastError;
    }

    if (response.status === 401 || response.status === 403) {
      // Ollama itself doesn't auth, but a reverse proxy in front might.
      throw new UpstreamError('auth_failed', response.status);
    }

    throw new UpstreamError('upstream_4xx', response.status);
  }

  throw lastError ?? new UpstreamError('rate_limited');
};
