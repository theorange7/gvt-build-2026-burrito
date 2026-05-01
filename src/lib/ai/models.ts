export type ModelProvider = 'anthropic' | 'azure-foundry';

export type ModelOption = {
  id: string;
  label: string;
  provider: ModelProvider;
  /** Provider-specific model identifier or Azure deployment name. */
  modelId: string;
};

export const MODEL_OPTIONS: ModelOption[] = [
  {
    id: 'anthropic:claude-sonnet-4',
    label: 'Claude Sonnet 4 (Anthropic)',
    provider: 'anthropic',
    modelId: 'claude-sonnet-4-20250514',
  },
  {
    id: 'azure:gpt-4o',
    label: 'GPT-4o (Azure Foundry)',
    provider: 'azure-foundry',
    modelId: 'gpt-4o',
  },
  {
    id: 'azure:gpt-4o-mini',
    label: 'GPT-4o mini (Azure Foundry)',
    provider: 'azure-foundry',
    modelId: 'gpt-4o-mini',
  },
  {
    id: 'azure:phi-4',
    label: 'Phi-4 (Azure Foundry)',
    provider: 'azure-foundry',
    modelId: 'Phi-4',
  },
  {
    id: 'azure:llama-3.3-70b',
    label: 'Llama 3.3 70B (Azure Foundry)',
    provider: 'azure-foundry',
    modelId: 'Llama-3.3-70B-Instruct',
  },
];

export const DEFAULT_MODEL_ID = MODEL_OPTIONS[0].id;

export function resolveModel(modelId: string | undefined): ModelOption {
  if (!modelId) return MODEL_OPTIONS[0];
  return MODEL_OPTIONS.find((m) => m.id === modelId) ?? MODEL_OPTIONS[0];
}
