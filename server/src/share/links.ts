import { TableClient, type TableEntity } from '@azure/data-tables';
import { DefaultAzureCredential } from '@azure/identity';
import { getEnvMode } from '../env';
import { isValidShareSlug } from './slug';

/**
 * `shareLinks` table — the *only* purpose of this row is to authorise revoke.
 *
 * Schema:
 *   PartitionKey  = first 2 chars of slug (load-balances partition fanout)
 *   RowKey        = full slug
 *   installId     = the install that published this share (revoke gate)
 *   jobId         = originating wrap job (operational breadcrumb only)
 *   createdAt     = ISO8601 server clock at publish time
 *   displayName?  = optional user-supplied title for the bundle
 *
 * No `userId`, no IP, no user-agent. No listing endpoint — the client
 * already knows which wraps it shared (the slug lives in the encrypted
 * local wrap row).
 */

type ShareLinkEntity = TableEntity<{
  installId: string;
  jobId: string;
  createdAt: string;
  displayName?: string;
}>;

export type ShareLinkRow = {
  slug: string;
  installId: string;
  jobId: string;
  createdAt: string;
  displayName?: string;
};

let cachedClient: Promise<TableClient> | null = null;

async function getClient(): Promise<TableClient> {
  if (cachedClient) return cachedClient;
  const tableName = process.env.AZURE_TABLES_SHARE_LINKS ?? 'shareLinks';
  if (getEnvMode() === 'local') {
    const cs = process.env.AZURE_TABLES_CONNECTION_STRING;
    if (!cs) throw new Error('AZURE_TABLES_CONNECTION_STRING must be set when ENV_MODE=local');
    const client = TableClient.fromConnectionString(cs, tableName, { allowInsecureConnection: true });
    cachedClient = client.createTable().catch(() => undefined).then(() => client);
  } else {
    const endpoint = process.env.AZURE_TABLES_ENDPOINT;
    if (!endpoint) throw new Error('AZURE_TABLES_ENDPOINT must be set when ENV_MODE is dev or prod');
    cachedClient = Promise.resolve(new TableClient(endpoint, tableName, new DefaultAzureCredential()));
  }
  return cachedClient;
}

export function _setShareLinksClientForTests(client: TableClient | null): void {
  cachedClient = client ? Promise.resolve(client) : null;
}

function partitionFor(slug: string): string {
  return slug.slice(0, 2);
}

export async function createShareLink(row: ShareLinkRow): Promise<void> {
  if (!isValidShareSlug(row.slug)) throw new Error('invalid-slug');
  const client = await getClient();
  const entity: ShareLinkEntity = {
    partitionKey: partitionFor(row.slug),
    rowKey: row.slug,
    installId: row.installId,
    jobId: row.jobId,
    createdAt: row.createdAt,
    displayName: row.displayName,
  };
  await client.createEntity(entity);
}

export async function getShareLink(slug: string): Promise<ShareLinkRow | null> {
  if (!isValidShareSlug(slug)) return null;
  const client = await getClient();
  try {
    const entity = (await client.getEntity(partitionFor(slug), slug)) as ShareLinkEntity;
    return {
      slug,
      installId: entity.installId,
      jobId: entity.jobId,
      createdAt: entity.createdAt,
      displayName: entity.displayName,
    };
  } catch (err) {
    if ((err as { statusCode?: number }).statusCode === 404) return null;
    throw err;
  }
}

export async function deleteShareLink(slug: string): Promise<void> {
  if (!isValidShareSlug(slug)) return;
  const client = await getClient();
  try {
    await client.deleteEntity(partitionFor(slug), slug);
  } catch (err) {
    if ((err as { statusCode?: number }).statusCode !== 404) throw err;
  }
}

/**
 * Find every share owned by `installId`. Used by `meReset` to cascade-delete
 * shared bundles when an install resets. Returns the full rows so callers
 * can also drop the corresponding blob folders.
 */
export async function listShareLinksForInstall(installId: string): Promise<ShareLinkRow[]> {
  const client = await getClient();
  const filter = `installId eq '${installId.replace(/'/g, "''")}'`;
  const out: ShareLinkRow[] = [];
  for await (const entity of client.listEntities<ShareLinkEntity>({
    queryOptions: { filter },
  })) {
    out.push({
      slug: entity.rowKey,
      installId: entity.installId,
      jobId: entity.jobId,
      createdAt: entity.createdAt,
      displayName: entity.displayName,
    });
  }
  return out;
}
