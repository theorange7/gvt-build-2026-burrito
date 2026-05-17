/*
 * PRIVACY: File-upload contribution importer (spec 50). This is the only
 * server function that briefly handles raw user file content. The carve-out
 * is bounded by mechanism, not policy:
 *   - NO PERSISTENCE: this file does not import from ../queue/* (Service Bus,
 *     Table Storage), does not import @azure/storage-blob, and does not
 *     import node:fs. The privacy-invariants test asserts each of those.
 *   - NO LOGGING OF CONTENT: only counts (contributions, rejectedRows) and
 *     the resolved modelId are eligible for logging. The file body, the
 *     model's raw output, and per-row signals/rawData are never written to
 *     any log or context.error call. The privacy-invariants test scans for
 *     `console.*` and `context.*` expressions and rejects anything richer.
 *   - NO REPLAY CACHE: the function reads the multipart body, calls the LLM
 *     once, validates rows, returns. Nothing survives function scope.
 *   - 256 KB hard cap on the file (well under any model's context window
 *     after prompt overhead). Larger files get 413.
 *   - Egress scope is the chosen model provider (Anthropic / Azure Foundry
 *     / Ollama) only. No other party sees the file. The UI disclosure names
 *     the provider before the user clicks upload.
 *
 * If you find yourself adding a queue, blob, table, disk write, or a richer
 * log statement here: stop. Either the request flow is wrong, or this whole
 * privacy posture needs to be revisited with the user first. See
 * tasks/50-file-upload-provider.md.
 */
import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import {
  importMetaSchema,
  importedContributionSchema,
  type ImportResponse,
} from '@wrapped/shared';
import { callModel } from '../ai/client';
import {
  IMPORT_EXTRACT_SYSTEM_PROMPT,
  buildImportExtractPrompt,
  parseExtractedContributions,
} from '../ai/prompts/importExtract';
import { requireInstallToken, HttpAuthError } from '../auth/middleware';
import { safeError } from '../privacy';

const MAX_FILE_BYTES = 256 * 1024;

function decodeUtf8Strict(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

async function readMultipart(request: HttpRequest): Promise<
  | { kind: 'ok'; file: Uint8Array; metaRaw: string }
  | { kind: 'error'; status: number; body: { error: string } }
> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return { kind: 'error', status: 400, body: { error: 'invalid-multipart' } };
  }

  const file = form.get('file');
  const meta = form.get('meta');
  if (!file || typeof file === 'string') {
    return { kind: 'error', status: 400, body: { error: 'missing-file' } };
  }
  if (!meta || typeof meta !== 'string') {
    return { kind: 'error', status: 400, body: { error: 'missing-meta' } };
  }

  const buffer = new Uint8Array(await file.arrayBuffer());
  if (buffer.byteLength > MAX_FILE_BYTES) {
    return { kind: 'error', status: 413, body: { error: 'file-too-large' } };
  }
  return { kind: 'ok', file: buffer, metaRaw: meta };
}

export async function importHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    await requireInstallToken(request);
  } catch (err) {
    if (err instanceof HttpAuthError) {
      return { status: err.status, jsonBody: { error: err.message } };
    }
    context.error('import auth failed', safeError(err));
    return { status: 500, jsonBody: { error: 'auth-error' } };
  }

  const multipart = await readMultipart(request);
  if (multipart.kind === 'error') {
    return { status: multipart.status, jsonBody: multipart.body };
  }

  let meta: ReturnType<typeof importMetaSchema.parse>;
  try {
    meta = importMetaSchema.parse(JSON.parse(multipart.metaRaw));
  } catch {
    return { status: 400, jsonBody: { error: 'invalid-meta' } };
  }

  const text = decodeUtf8Strict(multipart.file);
  if (text === null) {
    return { status: 415, jsonBody: { error: 'unreadable-text' } };
  }
  if (text.trim().length === 0) {
    return { status: 400, jsonBody: { error: 'empty-file' } };
  }

  let raw: string;
  try {
    raw = await callModel(
      IMPORT_EXTRACT_SYSTEM_PROMPT,
      buildImportExtractPrompt({ label: meta.label, fileText: text }),
      meta.modelId,
    );
  } catch (err) {
    context.error('import upstream failed', { modelId: meta.modelId, ...safeError(err) });
    return { status: 502, jsonBody: { error: 'extract-failed' } };
  }

  const rows = parseExtractedContributions(raw);
  if (rows === null) {
    context.error('import parse failed', { modelId: meta.modelId, code: 'parse_failed' });
    return { status: 502, jsonBody: { error: 'parse-failed' } };
  }

  const contributions: ImportResponse['contributions'] = [];
  let rejectedRows = 0;
  for (const row of rows) {
    const parsed = importedContributionSchema.safeParse(row);
    if (parsed.success) {
      contributions.push(parsed.data);
    } else {
      rejectedRows += 1;
    }
  }

  const body: ImportResponse = { contributions, rejectedRows };
  return { status: 200, jsonBody: body };
}

app.http('import', {
  route: 'import',
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: importHandler,
});
