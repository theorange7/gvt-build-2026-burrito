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
let etagCounter = 0;

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

function newEtag(): string {
  etagCounter += 1;
  return `W/"datetime'fake-${etagCounter}'"`;
}

// ── @azure/data-tables ───────────────────────────────────────────────────────

export class FakeTableClient {
  constructor(public endpoint: string, public name: string, public _credential?: unknown) {}

  static fromConnectionString(_cs: string, tableName: string): FakeTableClient {
    return new FakeTableClient(_cs, tableName);
  }

  async upsertEntity(entity: Entity, _mode?: 'Replace' | 'Merge'): Promise<void> {
    const stored = { ...entity, etag: newEtag() };
    tableFor(this.name).set(entityKey(entity.partitionKey, entity.rowKey), stored);
  }

  async createEntity(entity: Entity): Promise<void> {
    const t = tableFor(this.name);
    const k = entityKey(entity.partitionKey, entity.rowKey);
    if (t.has(k)) {
      const err = new Error('entity already exists') as Error & { statusCode: number };
      err.statusCode = 409;
      throw err;
    }
    t.set(k, { ...entity, etag: newEtag() });
  }

  async updateEntity(
    entity: Entity,
    _mode?: 'Replace' | 'Merge',
    options?: { etag?: string },
  ): Promise<{ etag: string }> {
    const t = tableFor(this.name);
    const k = entityKey(entity.partitionKey, entity.rowKey);
    const current = t.get(k);
    if (!current) {
      const err = new Error('not found') as Error & { statusCode: number };
      err.statusCode = 404;
      throw err;
    }
    if (options?.etag && options.etag !== '*' && options.etag !== current.etag) {
      const err = new Error('precondition failed') as Error & { statusCode: number };
      err.statusCode = 412;
      throw err;
    }
    const stored = { ...entity, etag: newEtag() };
    t.set(k, stored);
    return { etag: stored.etag };
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
    // Parse the OData-ish filters the server actually emits today:
    //   PartitionKey eq 'X'
    //   <column> eq '<value>'        (arbitrary column equality)
    //   status eq 'queued' or status eq 'running'   (single OR clause)
    // Anything more elaborate would need to land here intentionally with a
    // covering test.
    const partitionMatch = filter.match(/PartitionKey eq '([^']+)'/);
    const wantsQueuedOrRunning = /status eq 'queued' or status eq 'running'/.test(filter);
    // Strip the bits we've already accounted for, then collect any remaining
    // "<col> eq '<val>'" equalities. PartitionKey/RowKey are renamed to
    // partitionKey/rowKey to match the in-memory entity shape.
    const stripped = filter
      .replace(/PartitionKey eq '[^']+'/g, '')
      .replace(/status eq 'queued' or status eq 'running'/g, '');
    const equalities: Array<[string, string]> = [];
    const eqRe = /(\w+) eq '([^']*)'/g;
    let m: RegExpExecArray | null;
    while ((m = eqRe.exec(stripped)) !== null) {
      const col = m[1] === 'RowKey' ? 'rowKey' : m[1];
      equalities.push([col, m[2]]);
    }

    const rows = [...tableFor(this.name).values()].filter((entity) => {
      if (wantsQueuedOrRunning) {
        const s = String(entity.status);
        if (s !== 'queued' && s !== 'running') return false;
      }
      if (partitionMatch && entity.partitionKey !== partitionMatch[1]) return false;
      for (const [col, val] of equalities) {
        if (String(entity[col]) !== val) return false;
      }
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
  constructor(public namespace: string, public _credential?: unknown) {}

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
