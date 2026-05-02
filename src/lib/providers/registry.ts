import type { ContributionProvider } from './types';

const registry = new Map<string, ContributionProvider>();

export function registerProvider(provider: ContributionProvider): void {
  if (registry.has(provider.id)) {
    throw new Error(`Provider already registered: ${provider.id}`);
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
