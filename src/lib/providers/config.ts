import { z } from 'zod';
import providersConfig from './providers.config.json';

const ProviderEntrySchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  authMethods: z.array(z.enum(['api-token', 'oauth-pkce'])).min(1),
  scopes: z.array(z.string()),
  requiresInstanceUrl: z.boolean(),
  fixedInstanceUrl: z.string().url().optional(),
  clientId: z.string().optional(),
});

const ConfigSchema = z.object({
  providers: z.array(ProviderEntrySchema).min(1),
});

export type ProviderConfigEntry = z.infer<typeof ProviderEntrySchema>;
export type ProvidersConfig = z.infer<typeof ConfigSchema>;

export function parseProvidersConfig(raw: unknown): ProvidersConfig {
  const parsed = ConfigSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Invalid providers.config.json: ${parsed.error.message}`);
  }
  const ids = new Set<string>();
  for (const entry of parsed.data.providers) {
    if (ids.has(entry.id)) {
      throw new Error(`Duplicate provider id in providers.config.json: ${entry.id}`);
    }
    ids.add(entry.id);
  }
  return parsed.data;
}

export const PROVIDERS_CONFIG: ProvidersConfig = parseProvidersConfig(providersConfig);

export function getProviderConfig(id: string): ProviderConfigEntry {
  const found = PROVIDERS_CONFIG.providers.find((p) => p.id === id);
  if (!found) {
    throw new Error(`No config entry for provider: ${id}`);
  }
  return found;
}
