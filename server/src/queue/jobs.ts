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
}>;

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
