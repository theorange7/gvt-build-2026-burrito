/**
 * Built-in contribution sources known statically. The `ContributionSource`
 * type is intentionally `string` so providers added via the registry pattern
 * (see `docs/decisions/contribution-provider-pattern.md`) can introduce new
 * source identifiers without forcing a type change at every call site.
 */
export const KNOWN_CONTRIBUTION_SOURCES = [
  'github',
  'gitlab',
  'jira',
  'slack',
  'confluence',
  'manual',
] as const;

export type KnownContributionSource = (typeof KNOWN_CONTRIBUTION_SOURCES)[number];

export type ContributionSource = string;

export type ContributionCategory =
  | 'delivery'
  | 'collaboration'
  | 'mentorship'
  | 'process'
  | 'leadership'
  | 'other';

export type Contribution = {
  id: string;
  userId: string;
  source: ContributionSource;
  category: ContributionCategory;
  signal: string;
  rawData: Record<string, unknown>;
  occurredAt: Date;
  weight: number;
  externalId?: string;
  externalUrl?: string;
  identityId?: string;
  createdAt: Date;
};

export type ContributionForAI = {
  source: ContributionSource;
  category: ContributionCategory;
  signal: string;
  rawData: Record<string, unknown>;
  occurredAt: Date;
  weight: number;
};

export type WrapMode = 'snapshot' | 'year-end';

export type SliceContent = {
  sliceKey: string;
  headline: string;
  body: string;
  stat?: string | null;
  supporting?: string[] | null;
};

export type ManualContributionInput = {
  freeText: string;
  occurredAt?: Date;
  category?: ContributionCategory;
};
