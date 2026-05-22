import type { ContributionProvider } from './types';

const registry = new Map<string, ContributionProvider>();

export function registerProvider(provider: ContributionProvider): void {
  if (registry.has(provider.id)) {
    throw new Error(`Provider already registered: ${provider.id}`);
  }
  // Spec 50 invariant: a provider is either pull (sync) or push (import),
  // never both and never neither. Caught at registration so a misconfigured
  // adapter fails at module load, not at the first call.
  const hasSync = Boolean(provider.sync);
  const hasImport = Boolean(provider.import);
  if (hasSync === hasImport) {
    throw new Error(
      `Provider ${provider.id} must have exactly one of \`sync\` or \`import\` (found ${
        hasSync && hasImport ? 'both' : 'neither'
      }).`,
    );
  }
  registry.set(provider.id, Object.freeze(provider));
}

export function getProvider(id: string): ContributionProvider {
  const found = registry.get(id);
  if (!found) {
    throw new Error(`Unknown provider: ${id}`);
  }
  return found;
}

export function hasProvider(id: string): boolean {
  return registry.has(id);
}

export function listProviders(): ContributionProvider[] {
  return [...registry.values()];
}

export function __resetRegistryForTest(): void {
  registry.clear();
}
