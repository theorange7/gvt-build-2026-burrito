import { deleteServerData } from '@/lib/ai/reset';
import { lock } from './crypto';
import { db, META_KEYS } from './db';

export type ResetMode = 'clear-data' | 'forget-device';

export type ResetResult = {
  serverCleanup: 'ok' | 'partial' | 'offline';
  failedResources?: Array<'jobs' | 'results' | 'lookups' | 'shares'>;
};

export async function resetLocalState(
  mode: ResetMode,
  options?: { proceedLocalOnly?: boolean },
): Promise<ResetResult> {
  let serverCleanup: ResetResult['serverCleanup'] = 'ok';
  let failedResources: ResetResult['failedResources'];

  if (!options?.proceedLocalOnly) {
    try {
      const result = await deleteServerData();
      if (result.partial) {
        serverCleanup = 'partial';
        failedResources = result.failed;
      }
    } catch {
      serverCleanup = 'offline';
      if (mode === 'clear-data') {
        // Mode A: abort — user must retry when server is reachable.
        return { serverCleanup: 'offline' };
      }
      // Mode B: caller may choose to proceed local-only via proceedLocalOnly.
      return { serverCleanup: 'offline' };
    }
  } else {
    serverCleanup = 'offline';
  }

  await db().transaction(
    'rw',
    [
      db().contributions,
      db().wraps,
      db().identities,
      db().tokens,
      db().syncState,
      db().importedRanges,
      db().pendingWrapRequests,
      db().meta,
    ],
    async () => {
      await db().contributions.clear();
      await db().wraps.clear();
      await db().identities.clear();
      await db().tokens.clear();
      await db().syncState.clear();
      await db().importedRanges.clear();
      await db().pendingWrapRequests.clear();
      await db().meta.delete(META_KEYS.seeded);
      if (mode === 'forget-device') {
        await db().meta.delete(META_KEYS.kdfSalt);
        await db().meta.delete(META_KEYS.wrapInstallToken);
      }
    },
  );

  lock();

  return failedResources
    ? { serverCleanup, failedResources }
    : { serverCleanup };
}
