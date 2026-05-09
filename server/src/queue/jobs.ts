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

export async function deleteJobRow(installId: string, jobId: string): Promise<void> {
  const client = getClient();
  try {
    await client.deleteEntity(installId, jobId);
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status !== 404) throw err;
  }
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
