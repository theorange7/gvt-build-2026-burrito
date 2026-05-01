export type ContributionSource = 'github' | 'jira' | 'slack' | 'confluence' | 'manual';

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
