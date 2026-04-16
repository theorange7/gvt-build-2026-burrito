import { PrismaClient } from '@prisma/client';
import type { ContributionCategory, ContributionSource } from '@/lib/types';

const prisma = new PrismaClient();

type SeedContribution = {
  source: ContributionSource;
  category: ContributionCategory;
  signal: string;
  rawData: Record<string, unknown>;
  occurredAt: Date;
  weight: number;
  externalId: string;
  externalUrl?: string;
};

const signalTemplates = {
  githubDelivery: [
    'Merged PR implementing rate limiting for the payment API and cut abuse incidents by 60%',
    'Shipped audit-log export for compliance reviews after closing the final edge cases',
    'Delivered queue retry controls that reduced manual ops escalations during incident windows',
    'Completed the bulk beneficiary upload flow and handled validation errors across all edge paths',
    'Launched service health indicators in the admin console for faster triage during peaks',
  ],
  githubCollaboration: [
    'Reviewed and approved 3 PRs from junior engineers with detailed architectural feedback',
    'Paired with frontend teammates on API pagination changes and removed downstream rework',
    'Left refactoring guidance on shared auth utilities and aligned two squads on the final shape',
  ],
  jiraDelivery: [
    'Resolved PROJ-234 by migrating the legacy auth service to OAuth2 without breaking existing flows',
    'Closed the final tickets for the incident dashboard revamp and coordinated release readiness',
    'Delivered the backlog cleanup epic that retired 14 stale bugs from the citizen support queue',
    'Completed the policy renewal workflow and removed duplicate manual review steps',
  ],
  jiraProcess: [
    'Closed the sprint hygiene epic to standardize acceptance criteria across the platform team',
    'Resolved a release-readiness checklist gap that had been causing late QA surprises',
    'Finished the triage workflow update so incidents now route cleanly by severity',
  ],
  slackCollaboration: [
    'Unblocked the frontend team by clarifying the API contract in a Slack thread and saved roughly a day of rework',
    'Coordinated a rollout plan in Slack across infra, QA, and support during a risky release',
    'Summarized production learnings after the outage review and aligned follow-up owners asynchronously',
  ],
  slackMentorship: [
    'Answered a junior engineer’s questions about database indexing and explained the trade-offs clearly',
    'Walked a teammate through the release process in Slack and stayed online through the deploy',
    'Shared debugging steps for flaky tests and helped another squad isolate the root cause faster',
    'Explained our alert thresholds to a new hire and connected them to the right runbooks',
  ],
  confluenceProcess: [
    'Authored a Confluence page documenting the new incident response runbook',
    'Published migration notes for the entitlement service so future releases have a cleaner path',
    'Wrote the support handover guide for the Q4 policy launch and clarified escalation paths',
  ],
  confluenceLeadership: [
    'Drafted the architectural decision record for event-driven notifications and socialized the trade-offs',
    'Published a proposal for reducing duplicate reviews across squads and gained buy-in from engineering managers',
  ],
  manual: [
    'Captured stakeholder feedback after launch and translated it into the next iteration plan',
    'Facilitated a retro that turned recurring deployment pain into three concrete fixes',
    'Stepped in to coordinate comms during a cross-team dependency issue and kept delivery on track',
  ],
} as const;

const makeDate = (month: number, day: number) => new Date(Date.UTC(2025, month - 1, day, 9, 0, 0));

const pick = <T,>(items: readonly T[], index: number) => items[index % items.length];

export function buildSeedContributions(): SeedContribution[] {
  const items: SeedContribution[] = [];
  let sequence = 1;

  const push = (
    count: number,
    source: ContributionSource,
    category: ContributionCategory,
    monthStart: number,
    monthEnd: number,
    templates: readonly string[],
    weightPattern: number[],
    options?: { initiative?: boolean; peak?: boolean; mentorshipCluster?: boolean },
  ) => {
    for (let index = 0; index < count; index += 1) {
      const month = monthStart + (index % Math.max(1, monthEnd - monthStart + 1));
      const day = 2 + ((index * 5) % 24);
      const weight = weightPattern[index % weightPattern.length];
      const signalBase = pick(templates, sequence + index);
      const signal = options?.initiative
        ? `${signalBase} — self-started and carried from proposal to adoption`
        : options?.peak
          ? `${signalBase} — part of the Q2 delivery peak that shifted the roadmap forward`
          : options?.mentorshipCluster
            ? `${signalBase} — one of the mentorship moments teammates kept coming back to`
            : signalBase;
      items.push({
        source,
        category,
        signal,
        rawData: { source, templateIndex: (sequence + index) % templates.length },
        occurredAt: makeDate(month, day),
        weight,
        externalId: `${source}:${category}:${sequence}`,
        externalUrl: `https://example.com/${source}/${sequence}`,
      });
      sequence += 1;
    }
  };

  push(34, 'github', 'delivery', 1, 12, signalTemplates.githubDelivery, [2, 3, 3, 4, 2, 3]);
  push(18, 'github', 'collaboration', 1, 12, signalTemplates.githubCollaboration, [2, 3, 2, 3, 4]);
  push(22, 'jira', 'delivery', 1, 12, signalTemplates.jiraDelivery, [2, 3, 3, 4, 2]);
  push(10, 'jira', 'process', 1, 12, signalTemplates.jiraProcess, [2, 3, 2, 4]);
  push(12, 'slack', 'collaboration', 1, 12, signalTemplates.slackCollaboration, [2, 3, 3, 4]);
  push(8, 'slack', 'mentorship', 7, 9, signalTemplates.slackMentorship, [3, 4, 3, 5], { mentorshipCluster: true });
  push(7, 'confluence', 'process', 1, 12, signalTemplates.confluenceProcess, [2, 3, 4]);
  push(6, 'confluence', 'leadership', 1, 12, signalTemplates.confluenceLeadership, [3, 4, 5]);
  push(13, 'manual', 'other', 1, 12, signalTemplates.manual, [1, 2, 2, 3, 4]);

  const peakSignals = [
    'Shipped the payments reconciliation redesign that eliminated the weekly manual backfill',
    'Delivered the permit-processing overhaul ahead of the public launch milestone',
    'Rolled out resilient file ingestion for partner uploads with zero rollback events',
    'Closed the final migration steps for the case-management rewrite and steadied the release train',
  ];

  peakSignals.forEach((signal, index) => {
    items.push({
      source: index % 2 === 0 ? 'github' : 'jira',
      category: 'delivery',
      signal: `${signal} — part of the Q2 delivery peak that shifted the roadmap forward`,
      rawData: { source: 'peak', quarter: 'Q2' },
      occurredAt: makeDate(4 + (index % 3), 10 + index * 4),
      weight: index % 2 === 0 ? 5 : 4,
      externalId: `peak:q2:${index}`,
      externalUrl: `https://example.com/peak/${index}`,
    });
  });

  const initiatives = [
    'Proposed and built a lightweight release readiness board before anyone asked for it',
    'Created a reusable risk-review template that became the team default for major launches',
  ];

  initiatives.forEach((signal, index) => {
    items.push({
      source: 'manual',
      category: 'leadership',
      signal: `${signal} — self-started and carried from proposal to adoption`,
      rawData: { source: 'initiative' },
      occurredAt: makeDate(index === 0 ? 5 : 10, 18 + index * 2),
      weight: 5,
      externalId: `initiative:${index}`,
      externalUrl: `https://example.com/initiative/${index}`,
    });
  });

  return items
    .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())
    .slice(0, 134);
}

async function main() {
  await prisma.user.upsert({
    where: { id: 'demo-user' },
    update: {},
    create: { id: 'demo-user' },
  });

  await prisma.contribution.deleteMany({ where: { userId: 'demo-user' } });
  await prisma.wrapJob.deleteMany({ where: { userId: 'demo-user' } });

  const contributions = buildSeedContributions();

  for (const contribution of contributions) {
    await prisma.contribution.create({
      data: {
        userId: 'demo-user',
        source: contribution.source,
        category: contribution.category,
        signal: contribution.signal,
        rawData: JSON.stringify(contribution.rawData),
        occurredAt: contribution.occurredAt,
        weight: contribution.weight,
        externalId: contribution.externalId,
        externalUrl: contribution.externalUrl,
      },
    });
  }

  console.log(`Seeded demo-user with ${contributions.length} contributions.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
