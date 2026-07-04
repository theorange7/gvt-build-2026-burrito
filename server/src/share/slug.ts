import { randomBytes } from 'node:crypto';

/**
 * Generate a 128-bit-entropy share slug for a published wrap.
 *
 * 16 random bytes → 22 base64url chars (no padding, no `+`/`/`, no `=`).
 * Never derived from jobId, installId, or any user input — slug possession
 * is the capability and must be unguessable.
 */
export function generateShareSlug(): string {
  const bytes = randomBytes(16);
  return bytes
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

const SLUG_RE = /^[A-Za-z0-9_-]{22}$/;

/**
 * Defence-in-depth check before using a path-derived slug to construct blob
 * paths or table row keys. Anything that isn't a 22-char base64url slug is
 * rejected up-front so the rest of the share module can treat the value as
 * trusted.
 */
export function isValidShareSlug(slug: string): boolean {
  return typeof slug === 'string' && SLUG_RE.test(slug);
}
