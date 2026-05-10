import { SignJWT } from 'jose';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { signInstallToken, verifyInstallToken } from '../../src/auth/jwt';
import { _resetRateLimitForTests, checkIpRateLimit } from '../../src/auth/rateLimit';

// Capture original env so we can restore it after each test.
const savedEnv: Record<string, string | undefined> = {};
const JWT_ENV_KEYS = ['WRAP_JWT_SECRET', 'WRAP_JWT_ACTIVE_KID'];

function captureEnv() {
  for (const k of JWT_ENV_KEYS) savedEnv[k] = process.env[k];
  // Also capture any WRAP_JWT_KEY_* vars already present.
  for (const k of Object.keys(process.env)) {
    if (k.startsWith('WRAP_JWT_KEY_')) savedEnv[k] = process.env[k];
  }
}

function restoreEnv() {
  // Remove any WRAP_JWT_KEY_* vars set during the test.
  for (const k of Object.keys(process.env)) {
    if (k.startsWith('WRAP_JWT_KEY_')) delete process.env[k];
  }
  // Restore originals (or delete if they weren't set).
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

beforeEach(() => {
  captureEnv();
  // Clear JWT env to a known state before each test.
  delete process.env.WRAP_JWT_SECRET;
  delete process.env.WRAP_JWT_ACTIVE_KID;
  for (const k of Object.keys(process.env)) {
    if (k.startsWith('WRAP_JWT_KEY_')) delete process.env[k];
  }
  _resetRateLimitForTests();
});

afterEach(() => {
  restoreEnv();
});

describe('auth/jwt — backwards-compat (WRAP_JWT_SECRET)', () => {
  beforeEach(() => {
    process.env.WRAP_JWT_SECRET = 'legacy-secret-for-testing';
  });

  it('signs a token and verifies it, stamped with kid=legacy', async () => {
    const { token, installId, expiresAt } = await signInstallToken();
    expect(token.split('.')).toHaveLength(3);
    expect(installId).toMatch(/^[0-9a-f-]{36}$/);
    expect(expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));

    // Decode the header to confirm kid.
    const headerJson = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString());
    expect(headerJson.kid).toBe('legacy');

    const verified = await verifyInstallToken(token);
    expect(verified.installId).toBe(installId);
  });

  it('rejects a token signed with a different secret', async () => {
    const { token } = await signInstallToken();
    process.env.WRAP_JWT_SECRET = 'a-completely-different-secret';
    await expect(verifyInstallToken(token)).rejects.toThrow();
  });
});

describe('auth/jwt — multi-kid key map', () => {
  beforeEach(() => {
    process.env.WRAP_JWT_KEY_v2024 = 'old-secret-v2024';
    process.env.WRAP_JWT_KEY_v2025 = 'new-secret-v2025';
    process.env.WRAP_JWT_ACTIVE_KID = 'v2025';
  });

  it('signs with the active kid and verifies successfully', async () => {
    const { token, installId } = await signInstallToken();

    const headerJson = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString());
    expect(headerJson.kid).toBe('v2025');

    const verified = await verifyInstallToken(token);
    expect(verified.installId).toBe(installId);
  });

  it('verifies a token signed by a non-active (but still registered) kid', async () => {
    // Sign with the old key directly so we have a token with kid=v2024.
    process.env.WRAP_JWT_ACTIVE_KID = 'v2024';
    const { token, installId } = await signInstallToken();

    // Switch active to v2025 — v2024 token must still verify.
    process.env.WRAP_JWT_ACTIVE_KID = 'v2025';
    const verified = await verifyInstallToken(token);
    expect(verified.installId).toBe(installId);
  });

  it('rejects a token whose kid has been removed from the key map', async () => {
    // Sign with v2024 active.
    process.env.WRAP_JWT_ACTIVE_KID = 'v2024';
    const { token } = await signInstallToken();

    // Remove v2024 from the key map.
    delete process.env.WRAP_JWT_KEY_v2024;
    process.env.WRAP_JWT_ACTIVE_KID = 'v2025';

    await expect(verifyInstallToken(token)).rejects.toThrow(/Unknown kid/);
  });

  it('rotation scenario: old token verifies while both kids registered; new token uses new kid', async () => {
    // Step A: sign with kidA active.
    process.env.WRAP_JWT_ACTIVE_KID = 'v2024';
    const { token: tokenA, installId: idA } = await signInstallToken();

    // Step B: rotate active to kidB — kidA still in key map.
    process.env.WRAP_JWT_ACTIVE_KID = 'v2025';
    const { token: tokenB, installId: idB } = await signInstallToken();

    const headerA = JSON.parse(Buffer.from(tokenA.split('.')[0], 'base64url').toString());
    const headerB = JSON.parse(Buffer.from(tokenB.split('.')[0], 'base64url').toString());
    expect(headerA.kid).toBe('v2024');
    expect(headerB.kid).toBe('v2025');

    // Both tokens must verify.
    expect((await verifyInstallToken(tokenA)).installId).toBe(idA);
    expect((await verifyInstallToken(tokenB)).installId).toBe(idB);
  });
});

describe('auth/jwt — rejection cases', () => {
  beforeEach(() => {
    process.env.WRAP_JWT_KEY_v2025 = 'some-test-secret';
    process.env.WRAP_JWT_ACTIVE_KID = 'v2025';
  });

  it('rejects a token with no kid header', async () => {
    // Craft a token without a kid field manually.
    const key = new TextEncoder().encode('some-test-secret');
    const tokenNoKid = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('install-id-123')
      .setIssuer('wrapped-server')
      .setAudience('wrapped-client')
      .setExpirationTime('1h')
      .sign(key);

    await expect(verifyInstallToken(tokenNoKid)).rejects.toThrow(/missing kid/i);
  });

  it('rejects a token with an unknown kid', async () => {
    // Craft a token with an unregistered kid.
    const key = new TextEncoder().encode('some-test-secret');
    const tokenBadKid = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256', kid: 'v1999-unknown' })
      .setSubject('install-id-456')
      .setIssuer('wrapped-server')
      .setAudience('wrapped-client')
      .setExpirationTime('1h')
      .sign(key);

    await expect(verifyInstallToken(tokenBadKid)).rejects.toThrow(/Unknown kid/);
  });
});

describe('auth/jwt — configuration errors', () => {
  it('throws clearly when no signing key is configured at all', async () => {
    // All JWT env vars are cleared in beforeEach.
    await expect(signInstallToken()).rejects.toThrow(/No active JWT signing key configured/);
  });

  it('throws when WRAP_JWT_ACTIVE_KID points to an unregistered kid', async () => {
    process.env.WRAP_JWT_KEY_v2025 = 'some-secret';
    process.env.WRAP_JWT_ACTIVE_KID = 'v9999-missing';
    await expect(signInstallToken()).rejects.toThrow(/No active JWT signing key configured/);
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
