export type ModelProvider = 'anthropic' | 'azure-foundry';

export type ModelOption = {
  id: string;
  label: string;
  provider: ModelProvider;
  /** Provider-specific model identifier or Azure deployment name. */
  modelId: string;
  /** Optional version for Azure Foundry models. */
  version?: string;
};

/**
 * NOTE: For provider 'azure-foundry', `modelId` is the **deployment name** in
 * your Azure AI Foundry project, not the model family name. The defaults below
 * assume conventional deployment names; override them to match your project.
 *
 * Only Azure OpenAI–compatible deployments (GPT-4o, GPT-4o-mini, GPT-4.1, etc.)
 * are supported through @azure/ai-projects' getAzureOpenAIClient. Non-OpenAI
 * Foundry models (Phi, Llama, Mistral) are served by the separate Model
 * Inference API and would need @azure-rest/ai-inference to be wired up.
 */
export const MODEL_OPTIONS: ModelOption[] = [
  {
    id: 'azure:claude-haiku-4-5',
    label: 'claude-haiku-4-5 (Azure Foundry)',
    provider: 'azure-foundry',
    modelId: 'claude-haiku-4-5',
    version: '2025-10-01'
  },
  {
    id: 'azure:gpt-5.5-1',
    label: 'gpt-5.5-1 (Azure Foundry)',
    provider: 'azure-foundry',
    modelId: 'gpt-5.5-1',
    version: '2024-12-01-preview'
  },
];

export const DEFAULT_MODEL_ID = MODEL_OPTIONS[0].id;

export function resolveModel(modelId: string | undefined): ModelOption {
  if (!modelId) return MODEL_OPTIONS[0];
  return MODEL_OPTIONS.find((m) => m.id === modelId) ?? MODEL_OPTIONS[0];
}
