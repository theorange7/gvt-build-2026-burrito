/*
 * Design philosophy: Editorial brutalism softened by institutional modernism.
 * File role: Stage the dashboard as a live annual-record desk with asymmetry, evidence, and ceremony.
 * Guardrail: Avoid symmetric SaaS clichés; make the app feel curated and appraisal-ready.
 */
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { UnlockGate } from '@/components/unlock/UnlockGate';

export const dynamic = 'force-static';

export default function DashboardPage() {
  return (
    <UnlockGate>
      <DashboardShell />
    </UnlockGate>
  );
}
