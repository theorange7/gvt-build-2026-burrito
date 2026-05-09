import { TableClient, type TableEntity } from '@azure/data-tables';
import { DefaultAzureCredential } from '@azure/identity';
import type { SliceContent } from '@wrapped/shared';

type ResultEntity = TableEntity<{ payload: string; createdAt: string }>;

const PARTITION_KEY = 'wrap';

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

export async function putResult(jobId: string, sliceContent: SliceContent[]): Promise<void> {
  const client = getClient();
  const entity: ResultEntity = {
    partitionKey: PARTITION_KEY,
    rowKey: jobId,
    payload: JSON.stringify(sliceContent),
    createdAt: new Date().toISOString(),
  };
  await client.upsertEntity(entity, 'Replace');
}

export async function getAndDeleteResult(jobId: string): Promise<SliceContent[] | null> {
  const client = getClient();
  let entity: ResultEntity | null = null;
  try {
    entity = (await client.getEntity(PARTITION_KEY, jobId)) as ResultEntity;
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 404) return null;
    throw err;
  }
  try {
    await client.deleteEntity(PARTITION_KEY, jobId);
  } catch {
    // Best-effort delete; the row will TTL anyway. Swallow to avoid leaking
    // result content twice.
  }
  return JSON.parse(entity.payload) as SliceContent[];
}
