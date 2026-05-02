/*
 * PRIVACY: This module is the only one in src/lib/providers/** permitted to
 * import from src/lib/local-store/*. It bridges provider adapters to the
 * encrypted local store. Providers themselves stay storage-pure. Tokens,
 * identity profiles, and sync cursors flow through envelope encryption
 * (src/lib/local-store/crypto.ts). Do not log tokens, request bodies, or
 * response bodies from this file.
 */
import {
  bulkAddContributions,
  deleteContributionsByIdentity,
  findExistingExternalIds,
  type AddContributionInput,
} from '@/lib/local-store/contributions';
import {
  deleteIdentity,
  findIdentity,
  getIdentity,
  upsertIdentity,
} from '@/lib/local-store/identities';
import {
  computeBackfillGaps,
  addImportedRange,
  listImportedRanges,
  clearImportedRanges,
  type DateRange,
} from '@/lib/local-store/importedRanges';
import {
  deleteSyncState,
  getSyncState,
  setSyncCursor,
  setSyncResult,
} from '@/lib/local-store/syncState';
import { deleteTokens, getTokens, putTokens } from '@/lib/local-store/tokens';
import { getProvider } from './registry';
import {
  ProviderAuthError,
  type ContributionProvider,
  type ExternalIdentity,
  type RawEvent,
  type SyncCursor,
  type TokenSet,
} from './types';

export type ConnectResult = {
  identityId: string;
  isNew: boolean;
};

export type SyncResult = {
  added: number;
  skippedExisting: number;
  errors: number;
};

export type BackfillResult = {
  added: number;
  skippedExisting: number;
  skippedFullyCovered: boolean;
};

const CURSOR_FLUSH_EVERY_EVENTS = 50;

async function loadProviderContext(identityId: string): Promise<{
  provider: ContributionProvider;
  identity: ExternalIdentity;
  tokens: TokenSet;
}> {
  const stored = await getIdentity(identityId);
  if (!stored) throw new Error(`Unknown identity: ${identityId}`);
  const provider = getProvider(stored.providerId);
  const tokens = await getTokens(identityId);
  if (!tokens) throw new Error(`No tokens for identity: ${identityId}`);
  const identity: ExternalIdentity = {
    providerId: stored.providerId,
    instanceUrl: stored.instanceUrl,
    externalUserId: stored.externalUserId,
    username: stored.username,
    email: stored.email,
    displayName: stored.displayName,
    raw: stored.raw,
  };
  return { provider, identity, tokens };
}

export async function connectIdentityWithApiToken(args: {
  providerId: string;
  instanceUrl: string;
  token: string;
}): Promise<ConnectResult> {
  const provider = getProvider(args.providerId);
  if (provider.auth.kind !== 'api-token') {
    throw new Error(
      `Provider ${args.providerId} does not support api-token auth (kind=${provider.auth.kind}).`,
    );
  }

  const tokens = await provider.auth.validate({
    instanceUrl: args.instanceUrl,
    token: args.token,
  });
  const identity = await provider.identity.resolve({
    instanceUrl: args.instanceUrl,
    tokens,
  });

  const existing = await findIdentity(
    identity.providerId,
    identity.instanceUrl,
    identity.externalUserId,
  );
  const upserted = await upsertIdentity({
    providerId: identity.providerId,
    instanceUrl: identity.instanceUrl,
    externalUserId: identity.externalUserId,
    username: identity.username,
    email: identity.email,
    displayName: identity.displayName,
    raw: identity.raw,
  });
  await putTokens(upserted.id, tokens);

  return { identityId: upserted.id, isNew: existing === null };
}

async function persistEvents(
  identityId: string,
  provider: ContributionProvider,
  identity: ExternalIdentity,
  events: RawEvent[],
  filter?: (occurredAt: Date) => boolean,
): Promise<{ added: number; skippedExisting: number }> {
  if (events.length === 0) return { added: 0, skippedExisting: 0 };

  const inputs: AddContributionInput[] = [];
  for (const event of events) {
    const normalized = provider.sync.normalize({ event, identity });
    for (const c of normalized) {
      if (filter && !filter(c.occurredAt)) continue;
      inputs.push({
        signal: c.signal,
        rawData: c.rawData,
        source: c.source,
        category: c.category,
        weight: c.weight,
        occurredAt: c.occurredAt,
        externalId: c.externalId,
        externalUrl: c.externalUrl,
        identityId,
      });
    }
  }
  if (inputs.length === 0) return { added: 0, skippedExisting: 0 };

  const externalIds = inputs.map((i) => i.externalId).filter((x): x is string => Boolean(x));
  const existing = await findExistingExternalIds(identityId, externalIds);
  const fresh = inputs.filter((i) => !i.externalId || !existing.has(i.externalId));
  await bulkAddContributions(fresh);
  return {
    added: fresh.length,
    skippedExisting: inputs.length - fresh.length,
  };
}

export async function syncIdentity(
  identityId: string,
  options: { signal?: AbortSignal } = {},
): Promise<SyncResult> {
  const { provider, identity, tokens } = await loadProviderContext(identityId);
  const state = await getSyncState(identityId);

  const ctrl = new AbortController();
  if (options.signal) {
    if (options.signal.aborted) ctrl.abort();
    else options.signal.addEventListener('abort', () => ctrl.abort(), { once: true });
  }

  const buffer: RawEvent[] = [];
  let added = 0;
  let skippedExisting = 0;
  let latestOccurredAt = state?.cursor && typeof state.cursor.eventsAfter === 'string'
    ? state.cursor.eventsAfter
    : null;

  try {
    for await (const event of provider.sync.run({
      instanceUrl: identity.instanceUrl,
      identity,
      tokens,
      cursor: state?.cursor ?? null,
      signal: ctrl.signal,
      onTokensRefreshed: async (next) => {
        await putTokens(identityId, next);
      },
    })) {
      buffer.push(event);
      const eventDate = new Date(event.occurredAt).toISOString().slice(0, 10);
      if (!latestOccurredAt || eventDate > latestOccurredAt) {
        latestOccurredAt = eventDate;
      }
      if (buffer.length >= CURSOR_FLUSH_EVERY_EVENTS) {
        const flush = await persistEvents(identityId, provider, identity, buffer);
        added += flush.added;
        skippedExisting += flush.skippedExisting;
        buffer.length = 0;
        await setSyncCursor(identityId, {
          cursorVersion: 1,
          eventsAfter: latestOccurredAt,
        } as SyncCursor);
      }
    }
    const flush = await persistEvents(identityId, provider, identity, buffer);
    added += flush.added;
    skippedExisting += flush.skippedExisting;

    if (latestOccurredAt) {
      await setSyncCursor(identityId, {
        cursorVersion: 1,
        eventsAfter: latestOccurredAt,
      } as SyncCursor);
    }
    await setSyncResult(identityId, { lastSyncAt: Date.now(), lastError: null });
    return { added, skippedExisting, errors: 0 };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Sync failed';
    await setSyncResult(identityId, { lastSyncAt: Date.now(), lastError: message });
    if (e instanceof ProviderAuthError) throw e;
    throw e;
  }
}

export async function backfillIdentity(
  identityId: string,
  range: { start: Date; end: Date },
  options: { signal?: AbortSignal } = {},
): Promise<BackfillResult> {
  const { provider, identity, tokens } = await loadProviderContext(identityId);
  const stored = await listImportedRanges(identityId);
  const existing: DateRange[] = stored.map((r) => [r.start, r.end]);
  const { covered, gaps } = computeBackfillGaps(existing, range.start, range.end);

  if (covered) {
    return { added: 0, skippedExisting: 0, skippedFullyCovered: true };
  }

  const ctrl = new AbortController();
  if (options.signal) {
    if (options.signal.aborted) ctrl.abort();
    else options.signal.addEventListener('abort', () => ctrl.abort(), { once: true });
  }

  let added = 0;
  let skippedExisting = 0;

  for (const [gapStart, gapEnd] of gaps) {
    const buffer: RawEvent[] = [];
    const cursor: SyncCursor = {
      cursorVersion: 1,
      eventsAfter: gapStart.toISOString().slice(0, 10),
    };
    for await (const event of provider.sync.run({
      instanceUrl: identity.instanceUrl,
      identity,
      tokens,
      cursor,
      signal: ctrl.signal,
      onTokensRefreshed: async (next) => {
        await putTokens(identityId, next);
      },
    })) {
      const ts = event.occurredAt;
      if (ts < gapStart.getTime()) continue;
      if (ts > gapEnd.getTime()) continue;
      buffer.push(event);
    }
    const flush = await persistEvents(
      identityId,
      provider,
      identity,
      buffer,
      (occurredAt) => occurredAt >= gapStart && occurredAt <= gapEnd,
    );
    added += flush.added;
    skippedExisting += flush.skippedExisting;
  }

  await addImportedRange(identityId, range.start, range.end);
  return { added, skippedExisting, skippedFullyCovered: false };
}

export async function disconnectIdentity(
  identityId: string,
  options: { deleteContributions: boolean } = { deleteContributions: false },
): Promise<{ deletedContributions: number }> {
  const stored = await getIdentity(identityId);
  if (!stored) return { deletedContributions: 0 };

  const provider = getProvider(stored.providerId);
  const tokens = await getTokens(identityId);

  if (
    tokens &&
    provider.auth.kind === 'oauth-pkce' &&
    provider.capabilities.supportsRevocation
  ) {
    try {
      await provider.auth.revoke({ instanceUrl: stored.instanceUrl, tokens });
    } catch {
      // best-effort
    }
  }

  await deleteTokens(identityId);
  await deleteSyncState(identityId);
  await clearImportedRanges(identityId);

  let deletedContributions = 0;
  if (options.deleteContributions) {
    deletedContributions = await deleteContributionsByIdentity(identityId);
  }

  await deleteIdentity(identityId);
  return { deletedContributions };
}
