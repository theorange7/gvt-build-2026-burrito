import { describe, expect, it } from 'vitest';
import { generateShareSlug, isValidShareSlug } from '../../src/share/slug';

describe('generateShareSlug', () => {
  it('produces a 22-char base64url string (16 bytes of entropy)', () => {
    for (let i = 0; i < 50; i += 1) {
      const slug = generateShareSlug();
      expect(slug).toMatch(/^[A-Za-z0-9_-]{22}$/);
      expect(slug).not.toContain('=');
      expect(slug).not.toContain('+');
      expect(slug).not.toContain('/');
    }
  });

  it('decodes back to 16 bytes', () => {
    const slug = generateShareSlug();
    const padded = slug + '=='.slice(0, (4 - (slug.length % 4)) % 4);
    const standard = padded.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = Buffer.from(standard, 'base64');
    expect(decoded.length).toBe(16);
  });

  it('10,000 samples produce no duplicates', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 10_000; i += 1) {
      const slug = generateShareSlug();
      expect(seen.has(slug)).toBe(false);
      seen.add(slug);
    }
  });
});

describe('isValidShareSlug', () => {
  it('accepts a freshly generated slug', () => {
    expect(isValidShareSlug(generateShareSlug())).toBe(true);
  });

  it('rejects anything not 22 chars of base64url', () => {
    expect(isValidShareSlug('')).toBe(false);
    expect(isValidShareSlug('short')).toBe(false);
    expect(isValidShareSlug('a'.repeat(23))).toBe(false);
    expect(isValidShareSlug('a/b+c=========')).toBe(false);
    expect(isValidShareSlug('../../etc/passwd......')).toBe(false);
    expect(isValidShareSlug('a b'.padEnd(22, 'a'))).toBe(false);
  });
});
