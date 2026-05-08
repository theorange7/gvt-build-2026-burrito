/*
 * PRIVACY banner constant. Server modules under functions/ must include the
 * literal string "PRIVACY" in their file header — the privacy-invariants
 * test scans for it. Use `safeError` to log only error codes/messages, never
 * payload contents.
 */

export function safeError(err: unknown): { code: string; message: string } {
  if (err instanceof Error) {
    return { code: err.name || 'Error', message: err.message.slice(0, 240) };
  }
  return { code: 'Unknown', message: String(err).slice(0, 240) };
}
