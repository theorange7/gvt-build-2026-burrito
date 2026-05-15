import { TableClient, type TableEntity } from '@azure/data-tables';
import { DefaultAzureCredential } from '@azure/identity';
import type { SliceContent } from '@wrapped/shared';

type ResultEntity = TableEntity<{ payload: string; createdAt: string }>;

let cachedClient: TableClient | null = null;

function getClient(): TableClient {
  if (cachedClient) return cachedClient;
  const endpoint = process.env.AZURE_TABLES_ENDPOINT;
  const tableName = process.env.AZURE_TABLES_RESULTS ?? 'wrapResults';
  if (!endpoint) {
    throw new Error('AZURE_TABLES_ENDPOINT is not set. Configure it in the Functions app settings.');
  }
  cachedClient = new TableClient(endpoint, tableName, new DefaultAzureCredential());
  return cachedClient;
}

export function _setResultsClientForTests(client: TableClient | null): void {
  cachedClient = client;
}

/**
 * Result rows are partitioned by the owning install (the same install whose
 * job row authored them). Cross-install reads naturally 404 — ownership is
 * intrinsic to the storage layout rather than a check the application has to
 * remember to make. PartitionKey is intentionally not persisted as a column;
 * it lives only as the row's location.
 */
export async function putResult(
  partitionKey: string,
  jobId: string,
  sliceContent: SliceContent[],
): Promise<void> {
  const client = getClient();
  const entity: ResultEntity = {
    partitionKey,
    rowKey: jobId,
    payload: JSON.stringify(sliceContent),
    createdAt: new Date().toISOString(),
  };
  await client.upsertEntity(entity, 'Replace');
}

export async function deleteAllResultsForInstall(partitionKey: string): Promise<number> {
  const client = getClient();
  const filter = `PartitionKey eq '${partitionKey.replace(/'/g, "''")}'`;
  let removed = 0;
  for await (const entity of client.listEntities<ResultEntity>({ queryOptions: { filter, select: ['rowKey'] } })) {
    try {
      await client.deleteEntity(partitionKey, entity.rowKey as string);
      removed += 1;
    } catch (err) {
      if ((err as { statusCode?: number }).statusCode !== 404) throw err;
    }
  }
  return removed;
}

export async function getAndDeleteResult(
  partitionKey: string,
  jobId: string,
): Promise<SliceContent[] | null> {
  const client = getClient();
  let entity: ResultEntity | null = null;
  try {
    entity = (await client.getEntity(partitionKey, jobId)) as ResultEntity;
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 404) return null;
    throw err;
  }
  try {
    await client.deleteEntity(partitionKey, jobId);
  } catch {
    // Best-effort delete; the row will TTL anyway. Swallow to avoid leaking
    // result content twice.
  }
  return JSON.parse(entity.payload) as SliceContent[];
}
