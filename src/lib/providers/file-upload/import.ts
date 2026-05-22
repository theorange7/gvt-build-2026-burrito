/*
 * PRIVACY: This adapter forwards the user's File to the backend's POST
 * /import endpoint via the thin wrapper in src/lib/ai/import.ts. It does
 * not store the file anywhere on the client (the File reference goes out
 * of scope when the modal closes), it does not log file contents or the
 * model's response payload, and it does not import from local-store.
 */
import { FileImportError, importFile } from '@/lib/ai/import';
import type { ImportAdapter, NormalizedContribution } from '../types';
import { ProviderTransientError } from '../types';

function externalIdFor(c: NormalizedContribution): string {
  if (c.externalId) return c.externalId;
  // Fallback: deterministic from signal + occurredAt so re-imports of the
  // same file dedupe even if the model forgot to set externalId.
  const ts = c.occurredAt.toISOString().slice(0, 19);
  const sig = c.signal.replace(/\s+/g, ' ').trim().slice(0, 120);
  return `file-upload:${ts}:${sig}`;
}

export const fileUploadImport: ImportAdapter = {
  async run({ file, modelId, label, signal }) {
    try {
      const result = await importFile({ file, modelId, label, signal });
      const contributions: NormalizedContribution[] = result.contributions.map((c) => ({
        signal: c.signal,
        rawData: c.rawData ?? {},
        source: c.source,
        category: c.category,
        weight: c.weight,
        occurredAt: new Date(c.occurredAt),
        externalId: c.externalId,
        externalUrl: c.externalUrl,
      }));
      return { contributions, rejectedRows: result.rejectedRows };
    } catch (err) {
      if (err instanceof FileImportError) {
        // 4xx is a user / payload problem and should surface as-is; 5xx and
        // network errors are transient.
        if (err.status >= 500 || err.status === 0) {
          throw new ProviderTransientError(err.message, err.status);
        }
        throw err;
      }
      // Network error (fetch threw) or abort — treat as transient.
      const message = err instanceof Error ? err.message : 'import-failed';
      throw new ProviderTransientError(message);
    }
  },
  externalIdFor,
};
