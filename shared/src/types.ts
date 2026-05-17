/**
 * Types that cross the client/server boundary.
 *
 * This package is the single source of truth for request/response shapes and
 * for the domain types the wrap pipeline operates on. The Next.js client and
 * the Azure Functions backend both depend on it; nothing else flows between
 * the two deployables.
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

/** Open type so providers added via the registry pattern can introduce new sources. */
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

/** The shape sent over the wire to the backend. Identifying fields are stripped. */
export type ContributionForAI = {
  source: ContributionSource;
  category: ContributionCategory;
  signal: string;
  rawData: Record<string, unknown>;
  occurredAt: string;
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

export type JobStatus = 'queued' | 'running' | 'complete' | 'failed';

export type EnqueueWrapRequest = {
  jobId: string;
  contributions: ContributionForAI[];
  mode: WrapMode;
  windowStart: string;
  windowEnd: string;
  modelId?: string;
};

export type EnqueueWrapResponse = {
  jobId: string;
  status: Extract<JobStatus, 'queued' | 'running' | 'complete' | 'failed'>;
  busy?: boolean;
};

export type GetWrapResponse =
  | { status: 'queued' | 'running'; busy?: boolean }
  | { status: 'complete'; sliceContent: SliceContent[] }
  | { status: 'failed'; error: string };

export type ClassifyRequest = {
  source: ContributionSource;
  freeText: string;
};

export type ClassifyResponse = {
  signal: string;
  category: ContributionCategory;
  weight: number;
};

export type RegisterResponse = {
  token: string;
  expiresAt: number;
};

/**
 * What the server's POST /import endpoint returns per row. The shape mirrors
 * the client-side `NormalizedContribution` minus the orchestrator-stamped
 * fields (`id`, `userId`, `identityId`, `createdAt`). The orchestrator stamps
 * those on persist.
 */
export type ImportedContribution = {
  source: ContributionSource;
  category: ContributionCategory;
  signal: string;
  rawData: Record<string, unknown>;
  occurredAt: string;
  weight: number;
  externalId?: string;
  externalUrl?: string;
};

export type ImportResponse = {
  contributions: ImportedContribution[];
  rejectedRows: number;
};

/**
 * The JSON blob attached as the `meta` field of the multipart import request.
 * The file itself is the `file` field.
 */
export type ImportMeta = {
  modelId: string;
  label: string;
};
