import { TableClient, type TableEntity } from '@azure/data-tables';
import { DefaultAzureCredential } from '@azure/identity';
import type { JobStatus } from '@wrapped/shared';

export type JobRow = {
  installId: string;
  jobId: string;
  status: JobStatus;
  busy: boolean;
  errorCode?: string;
  createdAt: string;
  updatedAt: string;
};

type JobEntity = TableEntity<{
  status: JobStatus;
  busy: boolean;
  errorCode?: string;
  createdAt: string;
  updatedAt: string;
}> & { etag?: string };

export type JobRowWithEtag = JobRow & { etag: string };

let cachedClient: TableClient | null = null;

function getClient(): TableClient {
  if (cachedClient) return cachedClient;
  const endpoint = process.env.AZURE_TABLES_ENDPOINT;
  const tableName = process.env.AZURE_TABLES_JOBS ?? 'wrapJobs';
  if (!endpoint) {
    throw new Error('AZURE_TABLES_ENDPOINT is not set. Configure it in the Functions app settings.');
  }
  cachedClient = new TableClient(endpoint, tableName, new DefaultAzureCredential());
  return cachedClient;
}

export function _setJobsClientForTests(client: TableClient | null): void {
  cachedClient = client;
}

function entityToRow(e: JobEntity): JobRow {
  return {
    installId: e.partitionKey,
    jobId: e.rowKey,
    status: e.status,
    busy: !!e.busy,
    errorCode: e.errorCode,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  };
}

export async function upsertJobRow(row: JobRow): Promise<void> {
  const client = getClient();
  const entity: JobEntity = {
    partitionKey: row.installId,
    rowKey: row.jobId,
    status: row.status,
    busy: row.busy,
    errorCode: row.errorCode,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
  await client.upsertEntity(entity, 'Replace');
}

/**
 * Atomically inserts a new job row. Throws an error with `statusCode === 409`
 * if a row already exists for `(installId, jobId)`. Used by `wrapEnqueue` to
 * close the same-jobId TOCTOU window that `upsertJobRow` opens (see #2 in the
 * code-review notes).
 */
export async function createJobRow(row: JobRow): Promise<void> {
  const client = getClient();
  const entity: JobEntity = {
    partitionKey: row.installId,
    rowKey: row.jobId,
    status: row.status,
    busy: row.busy,
    errorCode: row.errorCode,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
  await client.createEntity(entity);
}

export function isConflictError(err: unknown): boolean {
  return (err as { statusCode?: number })?.statusCode === 409;
}

export async function getJobRow(installId: string, jobId: string): Promise<JobRow | null> {
  const client = getClient();
  try {
    const entity = (await client.getEntity(installId, jobId)) as JobEntity;
    return entityToRow(entity);
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 404) return null;
    throw err;
  }
}

/**
 * Same as `getJobRow` but also returns the row's ETag, for callers that need
 * to make a subsequent conditional write (`updateJobRow`). Used by the worker
 * to guard status transitions against redelivery races (see #3).
 */
export async function getJobRowWithEtag(installId: string, jobId: string): Promise<JobRowWithEtag | null> {
  const client = getClient();
  try {
    const entity = (await client.getEntity(installId, jobId)) as JobEntity;
    const etag = entity.etag ?? '';
    return { ...entityToRow(entity), etag };
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 404) return null;
    throw err;
  }
}

/**
 * Conditionally updates a job row using If-Match on the supplied ETag. Throws
 * with `statusCode === 412` if the row was modified by someone else since the
 * read — callers should treat that as "another worker delivery owns this job"
 * and bail without retrying blindly.
 *
 * Returns the new ETag so callers can chain successive transitions without an
 * intervening read.
 */
export async function updateJobRow(row: JobRow, etag: string): Promise<string> {
  const client = getClient();
  const entity: JobEntity = {
    partitionKey: row.installId,
    rowKey: row.jobId,
    status: row.status,
    busy: row.busy,
    errorCode: row.errorCode,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
  const result = (await client.updateEntity(entity, 'Replace', { etag })) as { etag?: string } | undefined;
  return result?.etag ?? '';
}

export function isPreconditionFailed(err: unknown): boolean {
  return (err as { statusCode?: number })?.statusCode === 412;
}

// ── Job-lookup table (#7) ────────────────────────────────────────────────────
//
// The Service Bus message carries an opaque `jobLookupToken` instead of the
// caller's `installId`. The worker resolves the token to an installId via a
// row in the same `wrapJobs` table under a reserved partition. Without this
// indirection, `installId` would persist in queue metadata, the dead-letter
// queue, and any auto-captured Application Insights traces — a per-install
// linkability surface the privacy banner forbids.

const LOOKUP_PARTITION = '__lookup__';

type LookupEntity = TableEntity<{ installId: string; jobId: string; createdAt: string }>;

export async function createLookupRow(args: {
  jobLookupToken: string;
  installId: string;
  jobId: string;
}): Promise<void> {
  const client = getClient();
  const entity: LookupEntity = {
    partitionKey: LOOKUP_PARTITION,
    rowKey: args.jobLookupToken,
    installId: args.installId,
    jobId: args.jobId,
    createdAt: new Date().toISOString(),
  };
  await client.createEntity(entity);
}

export async function resolveInstallIdFromToken(
  jobLookupToken: string,
): Promise<{ installId: string; jobId: string } | null> {
  const client = getClient();
  try {
    const entity = (await client.getEntity(LOOKUP_PARTITION, jobLookupToken)) as LookupEntity;
    return { installId: entity.installId, jobId: entity.jobId };
  } catch (err) {
    if ((err as { statusCode?: number }).statusCode === 404) return null;
    throw err;
  }
}

export async function deleteLookupRow(jobLookupToken: string): Promise<void> {
  const client = getClient();
  try {
    await client.deleteEntity(LOOKUP_PARTITION, jobLookupToken);
  } catch (err) {
    if ((err as { statusCode?: number }).statusCode !== 404) throw err;
  }
}

/**
 * Find and delete the lookup row(s) for a given job. Used by wrapGet when the
 * client fetches a terminal status — at that point both the job row and the
 * lookup row are dropped together. Returns the number of rows removed.
 */
export async function deleteLookupRowsForJob(installId: string, jobId: string): Promise<number> {
  const client = getClient();
  const filter =
    `PartitionKey eq '${LOOKUP_PARTITION}' and jobId eq '${jobId.replace(/'/g, "''")}' and installId eq '${installId.replace(/'/g, "''")}'`;
  let removed = 0;
  for await (const entity of client.listEntities<LookupEntity>({ queryOptions: { filter } })) {
    await client.deleteEntity(LOOKUP_PARTITION, entity.rowKey);
    removed += 1;
  }
  return removed;
}

export async function deleteJobRow(installId: string, jobId: string): Promise<void> {
  const client = getClient();
  try {
    await client.deleteEntity(installId, jobId);
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status !== 404) throw err;
  }
}

export async function deleteAllJobRowsForInstall(installId: string): Promise<number> {
  const client = getClient();
  const filter = `PartitionKey eq '${installId.replace(/'/g, "''")}'`;
  let removed = 0;
  for await (const entity of client.listEntities<JobEntity>({ queryOptions: { filter, select: ['rowKey'] } })) {
    try {
      await client.deleteEntity(installId, entity.rowKey as string);
      removed += 1;
    } catch (err) {
      if ((err as { statusCode?: number }).statusCode !== 404) throw err;
    }
  }
  return removed;
}

export async function deleteLookupRowsForInstall(installId: string): Promise<number> {
  const client = getClient();
  const filter = `PartitionKey eq '${LOOKUP_PARTITION}' and installId eq '${installId.replace(/'/g, "''")}'`;
  let removed = 0;
  for await (const entity of client.listEntities<LookupEntity>({ queryOptions: { filter } })) {
    try {
      await client.deleteEntity(LOOKUP_PARTITION, entity.rowKey);
      removed += 1;
    } catch (err) {
      if ((err as { statusCode?: number }).statusCode !== 404) throw err;
    }
  }
  return removed;
}

export async function countInflight(filter?: { installId?: string }): Promise<number> {
  const client = getClient();
  const baseFilter = `(status eq 'queued' or status eq 'running')`;
  const queryFilter = filter?.installId
    ? `${baseFilter} and PartitionKey eq '${filter.installId.replace(/'/g, "''")}'`
    : baseFilter;
  let count = 0;
  for await (const _entity of client.listEntities<JobEntity>({ queryOptions: { filter: queryFilter, select: ['rowKey'] } })) {
    count += 1;
  }
  return count;
}
