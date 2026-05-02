import type { RawEvent, SyncAdapter, SyncCursor } from '../types';
import { canonicalInstanceUrl, gitlabFetch, parseNextPage } from './client';
import { externalIdFor, normalize } from './normalize';
import { GITLAB_CURSOR_VERSION, type GitLabEvent, type GitLabSyncCursor } from './types';

function readCursor(cursor: SyncCursor | null): GitLabSyncCursor {
  if (!cursor || cursor.cursorVersion !== GITLAB_CURSOR_VERSION) {
    return { cursorVersion: GITLAB_CURSOR_VERSION, eventsAfter: null };
  }
  const eventsAfter =
    typeof cursor.eventsAfter === 'string' && cursor.eventsAfter.length > 0
      ? cursor.eventsAfter
      : null;
  return { cursorVersion: GITLAB_CURSOR_VERSION, eventsAfter };
}

async function* runEvents(args: {
  instanceUrl: string;
  identity: { externalUserId: string };
  tokens: { accessToken: string };
  cursor: SyncCursor | null;
  signal: AbortSignal;
}): AsyncIterable<RawEvent> {
  const canonical = canonicalInstanceUrl(args.instanceUrl);
  const parsedCursor = readCursor(args.cursor);

  let page: number | null = 1;
  while (page !== null) {
    if (args.signal.aborted) return;
    const response = await gitlabFetch<GitLabEvent[]>({
      instanceUrl: canonical,
      path: `/api/v4/users/${args.identity.externalUserId}/events`,
      query: {
        after: parsedCursor.eventsAfter ?? undefined,
        page,
        per_page: 20,
      },
      token: args.tokens.accessToken,
      signal: args.signal,
    });
    for (const event of response.data) {
      if (args.signal.aborted) return;
      yield {
        type: event.action_name,
        occurredAt: new Date(event.created_at).getTime(),
        payload: event,
      };
    }
    if (args.signal.aborted) return;
    page = parseNextPage(response.headers);
  }
}

export const gitlabSync: SyncAdapter = {
  run: runEvents,
  normalize,
  externalIdFor,
};
