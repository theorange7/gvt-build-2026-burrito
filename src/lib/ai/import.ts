/**
 * Thin HTTP wrapper around the server's POST /import endpoint (spec 50).
 *
 * Lives in src/lib/ai/ alongside classify.ts and generate.ts so the
 * "all server hops live under src/lib/ai/" rule stays intact. The
 * file-upload provider (src/lib/providers/file-upload/import.ts) calls
 * this; no other module should.
 *
 * This file MUST stay thin — no LLM SDK, no Azure SDK, no logging of the
 * file body or response payload. Enforced by the client privacy-invariants
 * test.
 */
import { importResponseSchema, type ImportResponse } from '@wrapped/shared';
import { authHeader, backendUrl } from './endpoint';

export class FileImportError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'FileImportError';
  }
}

export async function importFile(args: {
  file: File;
  modelId: string;
  label: string;
  signal?: AbortSignal;
}): Promise<ImportResponse> {
  const form = new FormData();
  form.append('file', args.file);
  form.append('meta', JSON.stringify({ modelId: args.modelId, label: args.label }));

  const response = await fetch(backendUrl('/import'), {
    method: 'POST',
    headers: { ...(await authHeader()) },
    body: form,
    signal: args.signal,
  });
  if (!response.ok) {
    let code = `import-failed-${response.status}`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) code = body.error;
    } catch {
      /* ignore */
    }
    throw new FileImportError(code, response.status);
  }
  const parsed = importResponseSchema.parse(await response.json());
  return parsed;
}
