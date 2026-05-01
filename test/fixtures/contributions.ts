import type { Contribution, ContributionCategory, ContributionSource } from '@/lib/types';
import type { AddContributionInput } from '@/lib/local-store/contributions';

export type FixtureRow = AddContributionInput & {
  signal: string;
  category: ContributionCategory;
  source: ContributionSource;
};

export const SAMPLE_CONTRIBUTIONS: FixtureRow[] = [
  {
    source: 'github',
    category: 'delivery',
    signal: 'Shipped the rate-limiting middleware that cut abuse incidents by 60%.',
    rawData: { pr: 1234 },
    occurredAt: new Date('2025-02-12T09:00:00Z'),
    weight: 5,
    externalId: 'github:pr:1234',
    externalUrl: 'https://example.com/pr/1234',
  },
  {
    source: 'github',
    category: 'collaboration',
    signal: 'Reviewed and approved 3 PRs from junior engineers with detailed feedback.',
    rawData: { reviews: 3 },
    occurredAt: new Date('2025-03-06T09:00:00Z'),
    weight: 3,
    externalId: 'github:review:42',
  },
  {
    source: 'jira',
    category: 'delivery',
    signal: 'Closed PROJ-100 by migrating legacy auth to OAuth2 without breaking existing flows.',
    rawData: { ticket: 'PROJ-100' },
    occurredAt: new Date('2025-04-20T09:00:00Z'),
    weight: 4,
    externalId: 'jira:PROJ-100',
  },
  {
    source: 'slack',
    category: 'mentorship',
    signal: 'Walked a teammate through the release process during a risky deploy.',
    rawData: { thread: 'T123' },
    occurredAt: new Date('2025-07-04T09:00:00Z'),
    weight: 4,
    externalId: 'slack:T123',
  },
  {
    source: 'confluence',
    category: 'leadership',
    signal: 'Drafted the architectural decision record for event-driven notifications.',
    rawData: { page: 'ADR-7' },
    occurredAt: new Date('2025-09-15T09:00:00Z'),
    weight: 5,
    externalId: 'confluence:ADR-7',
  },
  {
    source: 'manual',
    category: 'process',
    signal: 'Facilitated a retro that turned recurring deployment pain into three concrete fixes.',
    rawData: { notes: 'retro-q3' },
    occurredAt: new Date('2025-10-01T09:00:00Z'),
    weight: 3,
    externalId: 'manual:retro-q3',
  },
];

export function asContributions(): Contribution[] {
  return SAMPLE_CONTRIBUTIONS.map((row, index) => ({
    id: `fixture-${index}`,
    userId: 'local',
    source: row.source,
    category: row.category,
    signal: row.signal,
    rawData: row.rawData,
    occurredAt: row.occurredAt,
    weight: row.weight,
    externalId: row.externalId,
    externalUrl: row.externalUrl,
    createdAt: row.occurredAt,
  }));
}
