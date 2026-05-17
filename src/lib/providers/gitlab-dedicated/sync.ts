import { ProviderRateLimitError, type RawEvent, type SyncAdapter, type SyncCursor, type SyncPageProgress } from '../types';
import { canonicalInstanceUrl, gitlabFetch, parseNextPage, parseRateLimitHeaders } from './client';
import { externalIdFor, normalize } from './normalize';
import { GITLAB_CURSOR_VERSION, type GitLabEvent, type GitLabSyncCursor } from './types';

export const INTER_PAGE_DELAY_MS = 300;
const RATE_LIMIT_PAUSE_THRESHOLD = 5;
const MAX_RETRY_AFTER_MS = 60_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
  onProgress?: (progress: SyncPageProgress) => void;
}): AsyncIterable<RawEvent> {
  const canonical = canonicalInstanceUrl(args.instanceUrl);
  const parsedCursor = readCursor(args.cursor);

  let page: number | null = 1;
  let callsMade = 0;
  let eventsReceived = 0;
  let pageNumber = 0;

  while (page !== null) {
    if (args.signal.aborted) return;

    await sleep(INTER_PAGE_DELAY_MS);

    if (args.signal.aborted) return;

    // Fetch the page — on 429, retry once after Retry-After seconds.
    let response: Awaited<ReturnType<typeof gitlabFetch<GitLabEvent[]>>>;
    try {
      response = await gitlabFetch<GitLabEvent[]>({
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
      callsMade++;
    } catch (err) {
      if (err instanceof ProviderRateLimitError) {
        const waitMs = Math.min(err.retryAfterSeconds * 1000, MAX_RETRY_AFTER_MS);
        await sleep(waitMs);
        // Single retry — propagate if it also 429s.
        response = await gitlabFetch<GitLabEvent[]>({
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
        callsMade += 2; // initial failed call + retry
      } else {
        throw err;
      }
    }

    pageNumber++;

    // Proactive pause when rate limit window is nearly exhausted.
    const rateLimit = parseRateLimitHeaders(response.headers);
    if (rateLimit.remaining !== null && rateLimit.remaining <= RATE_LIMIT_PAUSE_THRESHOLD) {
      if (rateLimit.resetAt !== null) {
        const pauseMs = Math.max(0, rateLimit.resetAt * 1000 - Date.now());
        if (pauseMs > 0) await sleep(pauseMs);
      }
    }

    for (const event of response.data) {
      if (args.signal.aborted) return;
      eventsReceived++;
      yield {
        type: event.action_name,
        occurredAt: new Date(event.created_at).getTime(),
        payload: event,
      };
    }

    if (args.signal.aborted) return;

    args.onProgress?.({
      page: pageNumber,
      callsMade,
      eventsReceived,
      rateLimitRemaining: rateLimit.remaining,
    });

    page = parseNextPage(response.headers);
  }
}

export const gitlabSync: SyncAdapter = {
  run: runEvents,
  normalize,
  externalIdFor,
};
