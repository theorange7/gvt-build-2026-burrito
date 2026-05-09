/*
 * PRIVACY banner constant. Server modules under functions/ must include the
 * literal string "PRIVACY" in their file header — the privacy-invariants
 * test scans for it.
 *
 * `safeError` returns ONLY a fixed-allowlist code (and optionally a status
 * number). It deliberately does not surface `Error.message`, because upstream
 * SDKs (Anthropic, Azure OpenAI, Azure Tables) embed request URLs, request
 * IDs, prompt fragments, and response bodies in their messages. Anything that
 * doesn't map to a known code collapses to `'unknown'`.
 */

export type SafeError = { code: string; status?: number };

const ALLOWED_CODES = new Set<string>([
  'auth_failed',
  'config_missing',
  'invalid_payload',
  'max_retries',
  'not_found',
  'parse_failed',
  'queue_unavailable',
  'rate_limited',
  'storage_unavailable',
  'unknown',
  'upstream_4xx',
  'upstream_5xx',
  'upstream_timeout',
]);

/**
 * Marker class for upstream-provider failures (Anthropic, Azure Foundry).
 * Throwers must construct it with a fixed `code` from the allowlist; the
 * Error.message is intentionally generic so it can be logged verbatim.
 */
export class UpstreamError extends Error {
  readonly code: string;
  readonly status?: number;

  constructor(code: string, status?: number) {
    super(`upstream-error:${code}`);
    this.name = 'UpstreamError';
    this.code = code;
    this.status = status;
  }
}

function codeFromStatus(status: number): string {
  if (status === 429) return 'rate_limited';
  if (status === 408 || status === 504) return 'upstream_timeout';
  if (status === 401 || status === 403) return 'auth_failed';
  if (status === 404) return 'not_found';
  if (status >= 500) return 'upstream_5xx';
  if (status >= 400) return 'upstream_4xx';
  return 'unknown';
}

export function safeError(err: unknown): SafeError {
  if (err instanceof UpstreamError) {
    const code = ALLOWED_CODES.has(err.code) ? err.code : 'unknown';
    return err.status !== undefined ? { code, status: err.status } : { code };
  }
  if (err instanceof Error && err.name === 'ZodError') {
    return { code: 'invalid_payload' };
  }
  const status =
    (err as { status?: number; statusCode?: number })?.status
    ?? (err as { statusCode?: number })?.statusCode;
  if (typeof status === 'number') {
    const mapped = codeFromStatus(status);
    return ALLOWED_CODES.has(mapped) ? { code: mapped, status } : { code: 'unknown', status };
  }
  return { code: 'unknown' };
}
