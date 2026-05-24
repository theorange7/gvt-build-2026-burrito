#!/usr/bin/env node
/**
 * Generate 20 invite codes into Azure Table Storage.
 *
 * Usage (from server/ directory):
 *   node scripts/seed-invite-codes.mjs
 *   node scripts/seed-invite-codes.mjs --prefix LAUNCH --count 20
 *   node scripts/seed-invite-codes.mjs --cs "DefaultEndpointsProtocol=https;AccountName=..."
 *
 * Options:
 *   --prefix  Code prefix  (default: BURRITO)
 *   --count   Number of codes to generate (default: 20)
 *   --cs      Azure Storage connection string (overrides local.settings.json)
 */
import { TableClient } from '@azure/data-tables';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Parse CLI args
const args = process.argv.slice(2);
const arg = (flag, def) => {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] ? args[i + 1] : def;
};
const PREFIX = arg('--prefix', 'BURRITO').toUpperCase();
const COUNT  = parseInt(arg('--count', '20'), 10);
const CLI_CS = arg('--cs', null);

// Load connection string
function getConnectionString() {
  if (CLI_CS) return CLI_CS;
  try {
    const settings = JSON.parse(readFileSync(join(__dirname, '..', 'local.settings.json'), 'utf8')).Values;
    if (settings.AZURE_TABLES_CONNECTION_STRING) return settings.AZURE_TABLES_CONNECTION_STRING;
  } catch { /* no local.settings.json */ }
  throw new Error('No connection string found. Pass --cs "..." or set AZURE_TABLES_CONNECTION_STRING in local.settings.json');
}

function getTableName() {
  try {
    const settings = JSON.parse(readFileSync(join(__dirname, '..', 'local.settings.json'), 'utf8')).Values;
    return settings.AZURE_TABLES_INVITE_CODES || 'inviteCodes';
  } catch { return 'inviteCodes'; }
}

const NAMES = [
  'ALICE', 'BOB', 'CAROL', 'DAVE', 'EVE',
  'FRANK', 'GRACE', 'HENRY', 'IVY', 'JACK',
  'KATE', 'LEO', 'MIRA', 'NOAH', 'OLIVIA',
  'PAUL', 'QUINN', 'ROSE', 'SAM', 'TARA',
  'UMA', 'VICTOR', 'WENDY', 'XANDER', 'YARA',
  'ZOE', 'AARON', 'BELLE', 'CY', 'DAN',
];

function generateCodes(prefix, count) {
  return Array.from({ length: count }, (_, i) => {
    const name = NAMES[i] ?? `USER${String(i + 1).padStart(2, '0')}`;
    const num  = String(i + 1).padStart(2, '0');
    return `${prefix}-${name}-${num}`;
  });
}

async function main() {
  const cs        = getConnectionString();
  const tableName = getTableName();
  const codes     = generateCodes(PREFIX, COUNT);
  const isLocal   = cs.includes('127.0.0.1') || cs.includes('localhost') || cs.includes('UseDevelopmentEmulator');

  const client = TableClient.fromConnectionString(cs, tableName, {
    allowInsecureConnection: isLocal,
  });

  console.log(`Table : ${tableName}`);
  console.log(`Target: ${isLocal ? 'Azurite (local)' : 'Azure Storage (cloud)'}`);
  console.log(`Codes : ${COUNT}\n`);

  await client.createTable().catch(() => { /* already exists */ });

  const now = new Date().toISOString();
  let ok = 0, skip = 0;

  for (const code of codes) {
    try {
      await client.upsertEntity(
        { partitionKey: 'invite', rowKey: code, active: true, createdAt: now },
        'Replace',
      );
      console.log(`  ✓  ${code}`);
      ok++;
    } catch (err) {
      console.error(`  ✗  ${code}  — ${err.message}`);
      skip++;
    }
  }

  console.log(`\nDone — ${ok} inserted, ${skip} failed.`);
}

main().catch(err => { console.error(err.message); process.exit(1); });
