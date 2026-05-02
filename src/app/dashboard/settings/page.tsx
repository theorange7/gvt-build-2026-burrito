/*
 * Design philosophy: Editorial brutalism softened by institutional modernism.
 * File role: Gate the provider settings surface behind the unlock flow so
 *   credentials and identities stay encrypted at rest.
 * Guardrail: Never render configured tokens or identity profiles before the
 *   passphrase has unlocked the local store.
 */
import { SettingsShell } from '@/components/settings/SettingsShell';
import { UnlockGate } from '@/components/unlock/UnlockGate';

export const dynamic = 'force-static';

export default function SettingsPage() {
  return (
    <UnlockGate>
      <SettingsShell />
    </UnlockGate>
  );
}
