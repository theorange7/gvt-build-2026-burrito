import type { ModelOption } from '../models';

export type ProviderAdapter = (
  systemPrompt: string,
  userMessage: string,
  model: ModelOption,
) => Promise<string>;
