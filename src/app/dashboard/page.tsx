/*
 * Design philosophy: Editorial brutalism softened by institutional modernism.
 * File role: Stage the dashboard as a live annual-record desk with asymmetry, evidence, and ceremony.
 * Guardrail: Avoid symmetric SaaS clichés; make the app feel curated and appraisal-ready.
 */
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { db } from '@/lib/db';
import type { Contribution } from '@/lib/types';

function toContribution(item: {
  id: string;
  userId: string;
  source: string;
  category: string;
  signal: string;
  rawData: string;
  occurredAt: Date;
  weight: number;
  externalId: string | null;
  externalUrl: string | null;
  createdAt: Date;
}): Contribution {
  return {
    id: item.id,
    userId: item.userId,
    source: item.source as Contribution['source'],
    category: item.category as Contribution['category'],
    signal: item.signal,
    rawData: JSON.parse(item.rawData) as Record<string, unknown>,
    occurredAt: item.occurredAt,
    weight: item.weight,
    externalId: item.externalId ?? undefined,
    externalUrl: item.externalUrl ?? undefined,
    createdAt: item.createdAt,
  };
}

export default async function DashboardPage() {
  const contributions = await db.contribution.findMany({
    where: { userId: 'demo-user' },
    orderBy: { occurredAt: 'desc' },
  });

  return <DashboardShell initialContributions={contributions.map(toContribution)} />;
}
