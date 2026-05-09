/*
 * In-memory fakes for the Azure SDKs the server depends on.
 *
 * Each test file installs them via `vi.mock`:
 *
 *   vi.mock('@azure/data-tables', async () => {
 *     const m = await import('../fakes/azure');
 *     return { TableClient: m.FakeTableClient };
 *   });
 *   vi.mock('@azure/identity', async () => {
 *     const m = await import('../fakes/azure');
 *     return { DefaultAzureCredential: m.FakeDefaultAzureCredential };
 *   });
 *   vi.mock('@azure/service-bus', async () => {
 *     const m = await import('../fakes/azure');
 *     return { ServiceBusClient: m.FakeServiceBusClient };
 *   });
 *
 * Then call `resetAzureFakes()` in `beforeEach` to clear shared state.
 *
 * The fakes intentionally model only the surface the server uses today —
 * extending them is fine, but new behavior should ship with a test that
 * covers it.
 */

import type { InvocationContext } from '@azure/functions';

type Entity = Record<string, unknown> & { partitionKey: string; rowKey: string };

const tables = new Map<string, Map<string, Entity>>();

function entityKey(partitionKey: string, rowKey: string): string {
  return `${partitionKey}::${rowKey}`;
}

function tableFor(name: string): Map<string, Entity> {
  let t = tables.get(name);
  if (!t) {
    t = new Map();
    tables.set(name, t);
  }
  return t;
}

// ── @azure/data-tables ───────────────────────────────────────────────────────

export class FakeTableClient {
  constructor(public endpoint: string, public name: string, public _credential: unknown) {}

  async upsertEntity(entity: Entity, _mode?: 'Replace' | 'Merge'): Promise<void> {
    tableFor(this.name).set(entityKey(entity.partitionKey, entity.rowKey), { ...entity });
  }

  async getEntity(partitionKey: string, rowKey: string): Promise<Entity> {
    const e = tableFor(this.name).get(entityKey(partitionKey, rowKey));
    if (!e) {
      const err = new Error('not found') as Error & { statusCode: number };
      err.statusCode = 404;
      throw err;
    }
    return { ...e };
  }

  async deleteEntity(partitionKey: string, rowKey: string): Promise<void> {
    tableFor(this.name).delete(entityKey(partitionKey, rowKey));
  }

  listEntities<T = Entity>({
    queryOptions,
  }: {
    queryOptions: { filter: string; select?: string[] };
  }): AsyncIterable<T> {
    const filter = queryOptions.filter;
    const partitionMatch = filter.match(/PartitionKey eq '([^']+)'/);
    const wantsQueuedOrRunning = /status eq 'queued' or status eq 'running'/.test(filter);

    const rows = [...tableFor(this.name).values()].filter((entity) => {
      if (wantsQueuedOrRunning) {
        const s = String(entity.status);
        if (s !== 'queued' && s !== 'running') return false;
      }
      if (partitionMatch && entity.partitionKey !== partitionMatch[1]) return false;
      return true;
    });
    return (async function* () {
      for (const row of rows) yield row as T;
    })();
  }
}

// ── @azure/identity ──────────────────────────────────────────────────────────

export class FakeDefaultAzureCredential {}

// ── @azure/service-bus ───────────────────────────────────────────────────────

export type SentServiceBusMessage = {
  body: unknown;
  messageId?: string;
  contentType?: string;
  applicationProperties?: Record<string, unknown>;
};

const sentMessages: SentServiceBusMessage[] = [];

export class FakeServiceBusClient {
  constructor(public namespace: string, public _credential: unknown) {}

  createSender(_queue: string) {
    return {
      sendMessages: async (msg: SentServiceBusMessage | SentServiceBusMessage[]) => {
        const arr = Array.isArray(msg) ? msg : [msg];
        for (const m of arr) sentMessages.push({ ...m });
      },
    };
  }

  async close(): Promise<void> {}
}

// ── Test inspection / control helpers ────────────────────────────────────────

export function getSentServiceBusMessages(): readonly SentServiceBusMessage[] {
  return sentMessages;
}

export function popSentServiceBusMessage(): SentServiceBusMessage | undefined {
  return sentMessages.shift();
}

export function getTableEntities(tableName: string): Entity[] {
  return [...tableFor(tableName).values()].map((e) => ({ ...e }));
}

export function resetAzureFakes(): void {
  tables.clear();
  sentMessages.length = 0;
}

/**
 * Build an InvocationContext shaped like the Azure Functions runtime would
 * produce for a Service Bus trigger. The worker reads `installId` from
 * `triggerMetadata.applicationProperties`, so we surface whatever the
 * sender attached.
 *
 * Pass `logSink` to capture log calls — useful for canary assertions that
 * sensitive content never reaches `context.error`/`context.log`.
 */
export type LogEntry = { level: 'log' | 'info' | 'warn' | 'error'; args: unknown[] };

export function makeServiceBusTriggerContext(
  message: SentServiceBusMessage,
  logSink?: (entry: LogEntry) => void,
  options?: { deliveryCount?: number },
): InvocationContext {
  const log = (level: LogEntry['level']) => (...args: unknown[]) => {
    logSink?.({ level, args });
  };
  return {
    log: log('log'),
    info: log('info'),
    warn: log('warn'),
    error: log('error'),
    triggerMetadata: {
      applicationProperties: message.applicationProperties ?? {},
      messageId: message.messageId,
      deliveryCount: options?.deliveryCount ?? 1,
    },
  } as unknown as InvocationContext;
}
