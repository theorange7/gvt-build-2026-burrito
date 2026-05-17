/*
 * Provider registry. Adding a new model target means three edits:
 *
 *   1. Add the new provider id to `ModelProvider` in ../models.ts.
 *   2. Implement a `ProviderAdapter` in a new file under this directory.
 *   3. Add the row below — TypeScript's `Record<ModelProvider, …>` will fail
 *      the build if the mapping isn't exhaustive.
 *
 * Each adapter is responsible for translating the (systemPrompt, userMessage,
 * model) call into its own wire protocol and collapsing failures into
 * UpstreamError codes from the privacy allowlist.
 */
import type { ModelProvider } from '../models';
import type { ProviderAdapter } from './types';
import { callAnthropic } from './anthropic';
import { callAzureFoundry } from './azureFoundry';
import { callOllama } from './ollama';

export const ADAPTERS: Record<ModelProvider, ProviderAdapter> = {
  anthropic: callAnthropic,
  'azure-foundry': callAzureFoundry,
  ollama: callOllama,
};
