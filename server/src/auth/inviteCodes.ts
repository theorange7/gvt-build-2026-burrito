/**
 * Dynamic invite-code store backed by Azure Table Storage.
 *
 * Table schema
 * ────────────
 *   PartitionKey : 'invite'          (fixed — all codes share one partition)
 *   RowKey       : the invite code   (e.g. 'BURRITO-ALICE-01', case-preserved)
 *   active       : boolean           (omit or set true to enable; false to revoke)
 *   label        : string?           (optional human-readable description)
 *   createdAt    : ISO string
 *
 * To add a code:   insert a row with partitionKey='invite', rowKey=code
 * To revoke a code: set active=false on the row, or delete it
 *
 * Local dev: uses Azurite via AZURE_TABLES_CONNECTION_STRING.
 * The table is auto-created on first use.
 */
import { TableClient, type TableEntity } from '@azure/data-tables';
import { DefaultAzureCredential } from '@azure/identity';
import { getEnvMode } from '../env';

const PARTITION = 'invite';

type InviteCodeEntity = TableEntity<{
  active?: boolean;
  label?: string;
  createdAt: string;
}>;

let cachedClient: Promise<TableClient> | null = null;
let _testClient: TableClient | null | undefined = undefined;

function getTableName(): string {
  return process.env.AZURE_TABLES_INVITE_CODES ?? 'inviteCodes';
}

/**
 * Returns true when the invite-codes table is configured.
 * When false, authRegister falls back to the INVITE_CODES env-var list (or open access).
 */
export function isInviteCodesTableConfigured(): boolean {
  return Boolean(process.env.AZURE_TABLES_INVITE_CODES);
}

async function getClient(): Promise<TableClient> {
  if (_testClient !== undefined) return _testClient as TableClient;
  if (cachedClient) return cachedClient;

  const tableName = getTableName();

  if (getEnvMode() === 'local') {
    const cs = process.env.AZURE_TABLES_CONNECTION_STRING;
    if (!cs) throw new Error('AZURE_TABLES_CONNECTION_STRING must be set when ENV_MODE=local');
    const client = TableClient.fromConnectionString(cs, tableName, { allowInsecureConnection: true });
    // Auto-create on first use; swallow 409 if already exists.
    cachedClient = client.createTable().catch(() => undefined).then(() => client);
  } else {
    const endpoint = process.env.AZURE_TABLES_ENDPOINT;
    if (!endpoint) throw new Error('AZURE_TABLES_ENDPOINT must be set when ENV_MODE is dev or prod');
    cachedClient = Promise.resolve(new TableClient(endpoint, tableName, new DefaultAzureCredential()));
  }

  return cachedClient;
}

/**
 * Look up an invite code in the Azure Table.
 * Returns true if the code exists and has not been revoked (active !== false).
 * Returns false if the code is not found or has active=false.
 * Throws on unexpected storage errors.
 */
export async function isInviteCodeValid(code: string): Promise<boolean> {
  const client = await getClient();
  try {
    const entity = await client.getEntity<InviteCodeEntity>(PARTITION, code.trim());
    return (entity as { active?: boolean }).active !== false;
  } catch (err: unknown) {
    if ((err as { statusCode?: number }).statusCode === 404) return false;
    throw err;
  }
}

/** Dependency-injection hook for unit tests. Pass null to restore default behaviour. */
export function _setInviteCodesClientForTests(client: TableClient | null): void {
  _testClient = client;
  cachedClient = null;
}
