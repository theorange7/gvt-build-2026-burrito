import { z } from 'zod';
import modelsConfig from './models.config.json';

/**
 * Model catalog and per-model request parameters.
 *
 * Edit `models.config.json` to add, remove, or retune models. Each entry's
 * `parameters` object is forwarded verbatim into the upstream chat-completions
 * request, so put provider-specific knobs (temperature, max_tokens, top_p, …)
 * there. Validation runs at import time — a malformed entry fails fast.
 *
 * For provider 'azure-foundry', `modelId` is the **deployment name** in your
 * Azure AI Foundry project, not the model family. Only Azure OpenAI–compatible
 * deployments work through @azure/ai-projects' getAzureOpenAIClient. Non-OpenAI
 * Foundry models (Phi, Llama, Mistral) are served by the separate Model
 * Inference API and would need @azure-rest/ai-inference to be wired up.
 *
 * For provider 'ollama', `modelId` is the tag passed to `ollama pull`
 * (e.g. `llama3.1:8b`). The optional `baseUrl` overrides the default
 * `http://localhost:11434` for a single entry; the env var `OLLAMA_BASE_URL`
 * applies deployment-wide. `parameters` is forwarded into Ollama's `options`
 * blob, so power users can tune `num_ctx`, `num_predict`, `top_k`, `top_p`,
 * `repeat_penalty`, `keep_alive`, etc. without code changes.
 */

const ParameterValueSchema = z.union([z.string(), z.number(), z.boolean()]);
export type ModelParameterValue = z.infer<typeof ParameterValueSchema>;
export type ModelParameters = Record<string, ModelParameterValue>;

const ModelOptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  provider: z.enum(['anthropic', 'azure-foundry', 'ollama']),
  modelId: z.string().min(1),
  version: z.string().optional(),
  // Per-entry override for the upstream base URL. Used by the ollama adapter;
  // ignored by anthropic / azure-foundry (which derive endpoints from env or
  // the project client). Operator-controlled — never accepted on the wire.
  baseUrl: z.string().url().optional(),
  parameters: z.record(ParameterValueSchema).optional(),
});

const ConfigSchema = z.object({
  models: z.array(ModelOptionSchema).min(1),
});

export type ModelProvider = z.infer<typeof ModelOptionSchema>['provider'];
export type ModelOption = z.infer<typeof ModelOptionSchema>;

const parsed = ConfigSchema.safeParse(modelsConfig);
if (!parsed.success) {
  throw new Error(`Invalid models.config.json: ${parsed.error.message}`);
}

const ids = new Set<string>();
for (const model of parsed.data.models) {
  if (ids.has(model.id)) {
    throw new Error(`Duplicate model id in models.config.json: ${model.id}`);
  }
  ids.add(model.id);
}

export const MODEL_OPTIONS: ModelOption[] = parsed.data.models;
export const DEFAULT_MODEL_ID = MODEL_OPTIONS[0].id;

export function resolveModel(modelId: string | undefined): ModelOption {
  if (!modelId) return MODEL_OPTIONS[0];
  return MODEL_OPTIONS.find((m) => m.id === modelId) ?? MODEL_OPTIONS[0];
}
