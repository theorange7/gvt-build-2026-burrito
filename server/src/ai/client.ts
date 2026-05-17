/*
 * PRIVACY: This module dispatches per-slice prompts to a provider adapter
 * (Anthropic, Azure Foundry, Ollama, …). It owns no wire calls itself.
 * Do not add request-body logging here. Per-provider PRIVACY banners and
 * UpstreamError discipline live in ./providers/<provider>.ts.
 */
import { resolveModel } from './models';
import { ADAPTERS } from './providers';

export async function callModel(
  systemPrompt: string,
  userMessage: string,
  modelId?: string,
): Promise<string> {
  const model = resolveModel(modelId);
  return ADAPTERS[model.provider](systemPrompt, userMessage, model);
}

// Re-export the deprecated direct-Anthropic shim so existing callers
// (classify.ts and the unit-test suite) keep working unchanged.
export { callClaude } from './providers/anthropic';
