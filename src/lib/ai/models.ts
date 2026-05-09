/**
 * Public-facing model catalog for the client dropdown. Only `id` and `label`
 * cross the wire; the canonical config (provider, deployment name,
 * parameters) lives in the backend at `server/src/ai/models.config.json`.
 *
 * Keep this list aligned with the server's catalog. The backend silently
 * falls back to its default when it receives an unknown id, so a drift
 * here doesn't break generation — it just means the UI may offer a model
 * the backend doesn't actually have.
 */
export type PublicModelOption = {
  id: string;
  label: string;
};

export const MODEL_OPTIONS: PublicModelOption[] = [
  { id: 'azure:claude-haiku-4-5', label: 'claude-haiku-4-5 (Azure Foundry)' },
  { id: 'azure:gpt-5.5-1', label: 'gpt-5.5-1 (Azure Foundry)' },
  { id: 'anthropic:claude-sonnet-4', label: 'Claude Sonnet 4 (Anthropic direct)' },
];

export const DEFAULT_MODEL_ID = MODEL_OPTIONS[0].id;
