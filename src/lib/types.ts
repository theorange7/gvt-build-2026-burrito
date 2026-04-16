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

export type WrapMode = 'snapshot' | 'year-end';

export type WrapJob = {
  id: string;
  status: 'pending' | 'processing' | 'complete' | 'failed';
  userId: string;
  mode: WrapMode;
  windowStart: Date;
  windowEnd: Date;
  sliceContent?: SliceContent[];
  micrositeUrl?: string;
  videoUrl?: string;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
};

export type SliceContent = {
  sliceKey: string;
  headline: string;
  body: string;
  stat?: string | null;
  supporting?: string[] | null;
};

export type ManualContributionInput = {
  userId: string;
  freeText: string;
  occurredAt?: Date;
  category?: ContributionCategory;
};
