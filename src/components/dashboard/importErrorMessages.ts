/**
 * Maps server-side error codes from the /import endpoint to short,
 * user-readable copy shown in the pending-imports row. Centralising
 * the mapping here keeps raw machine codes out of the UI and makes
 * copy changes a single-file edit.
 *
 * Any code not in the table falls back to a generic message so future
 * server additions degrade gracefully instead of leaking a confusing
 * slug to the user.
 */
const ERROR_MESSAGES: Readonly<Record<string, string>> = {
  'unsupported-file-type': 'File type not supported',
  'unreadable-file': 'File could not be read',
  'empty-file': 'File is empty',
  'extracted-text-too-large': 'File is too large',
  'extract-failed': 'Extraction failed',
  'import-failed': 'Import failed',
  'cancelled': 'Cancelled',
  'upstream-error': 'Service temporarily unavailable',
  'upstream-timeout': 'Request timed out',
  'model-not-found': 'Selected model unavailable',
  'invalid-response': 'Unexpected response from service',
};

export function friendlyImportError(code: string): string {
  return ERROR_MESSAGES[code] ?? 'Import failed';
}
