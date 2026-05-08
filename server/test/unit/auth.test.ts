import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { signInstallToken, verifyInstallToken } from '../../src/auth/jwt';
import { _resetRateLimitForTests, checkIpRateLimit } from '../../src/auth/rateLimit';

const originalSecret = process.env.WRAP_JWT_SECRET;

beforeEach(() => {
  process.env.WRAP_JWT_SECRET = 'test-secret-please-change-me';
  _resetRateLimitForTests();
});

afterEach(() => {
  process.env.WRAP_JWT_SECRET = originalSecret;
});

describe('auth/jwt', () => {
  it('signs a token and verifies it with the same secret', async () => {
    const { token, installId, expiresAt } = await signInstallToken();
    expect(token.split('.')).toHaveLength(3);
    expect(installId).toMatch(/^[0-9a-f-]{36}$/);
    expect(expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));

    const verified = await verifyInstallToken(token);
    expect(verified.installId).toBe(installId);
  });

  it('rejects a token signed with a different secret', async () => {
    const { token } = await signInstallToken();
    process.env.WRAP_JWT_SECRET = 'a-completely-different-secret';
    await expect(verifyInstallToken(token)).rejects.toThrow();
  });

  it('throws when WRAP_JWT_SECRET is missing', async () => {
    delete process.env.WRAP_JWT_SECRET;
    await expect(signInstallToken()).rejects.toThrow(/WRAP_JWT_SECRET/);
  });
});

describe('auth/rateLimit', () => {
  it('allows up to N requests per IP per hour, then blocks', () => {
    const ip = '198.51.100.7';
    const now = Date.now();
    for (let i = 0; i < 3; i += 1) {
      const ok = checkIpRateLimit(ip, 3, now);
      expect(ok.ok).toBe(true);
    }
    const blocked = checkIpRateLimit(ip, 3, now);
    expect(blocked.ok).toBe(false);
    expect(blocked.resetAt).toBeGreaterThan(now);
  });

  it('resets after the window elapses', () => {
    const ip = '198.51.100.8';
    const now = Date.now();
    expect(checkIpRateLimit(ip, 1, now).ok).toBe(true);
    expect(checkIpRateLimit(ip, 1, now).ok).toBe(false);
    const later = now + 60 * 60 * 1000 + 1;
    expect(checkIpRateLimit(ip, 1, later).ok).toBe(true);
  });

  it('isolates buckets per IP', () => {
    const now = Date.now();
    expect(checkIpRateLimit('a', 1, now).ok).toBe(true);
    expect(checkIpRateLimit('b', 1, now).ok).toBe(true);
    expect(checkIpRateLimit('a', 1, now).ok).toBe(false);
  });
});
