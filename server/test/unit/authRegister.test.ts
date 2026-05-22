import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { HttpRequest, InvocationContext } from '@azure/functions';
import { authRegister, validateInviteCode } from '../../src/functions/authRegister';
import { _resetRateLimitForTests } from '../../src/auth/rateLimit';

beforeAll(() => {
  process.env.WRAP_JWT_SECRET = 'test-secret-please-change-me';
});

beforeEach(() => {
  delete process.env.INVITE_CODES;
  _resetRateLimitForTests();
});

afterEach(() => {
  delete process.env.INVITE_CODES;
});

function makeRequest(body?: Record<string, unknown>): HttpRequest {
  return {
    method: 'POST',
    url: 'http://localhost/api/auth/register',
    headers: { get: () => null },
    params: {},
    json: () => (body ? Promise.resolve(body) : Promise.reject(new Error('no body'))),
  } as unknown as HttpRequest;
}

function makeContext(): InvocationContext {
  return {
    error: () => undefined,
    log: () => undefined,
    info: () => undefined,
    warn: () => undefined,
  } as unknown as InvocationContext;
}

// ---------------------------------------------------------------------------
// validateInviteCode — pure unit tests
// ---------------------------------------------------------------------------

describe('validateInviteCode', () => {
  it('returns true when INVITE_CODES is not set (open access)', () => {
    delete process.env.INVITE_CODES;
    expect(validateInviteCode('anything')).toBe(true);
    expect(validateInviteCode('')).toBe(true);
  });

  it('returns true when INVITE_CODES is an empty string (open access)', () => {
    process.env.INVITE_CODES = '';
    expect(validateInviteCode('anything')).toBe(true);
  });

  it('returns true for a valid code', () => {
    process.env.INVITE_CODES = 'BURRITO-ALICE-01,BURRITO-BOB-02';
    expect(validateInviteCode('BURRITO-ALICE-01')).toBe(true);
    expect(validateInviteCode('BURRITO-BOB-02')).toBe(true);
  });

  it('returns false for an invalid code', () => {
    process.env.INVITE_CODES = 'BURRITO-ALICE-01,BURRITO-BOB-02';
    expect(validateInviteCode('WRONG-CODE')).toBe(false);
    expect(validateInviteCode('')).toBe(false);
    expect(validateInviteCode('burrito-alice-01')).toBe(false); // case-sensitive
  });

  it('trims whitespace around codes in the env var', () => {
    process.env.INVITE_CODES = ' BURRITO-ALICE-01 , BURRITO-BOB-02 ';
    expect(validateInviteCode('BURRITO-ALICE-01')).toBe(true);
    expect(validateInviteCode('BURRITO-BOB-02')).toBe(true);
  });

  it('trims whitespace from the submitted code', () => {
    process.env.INVITE_CODES = 'BURRITO-ALICE-01';
    expect(validateInviteCode('  BURRITO-ALICE-01  ')).toBe(true);
  });

  it('returns true when INVITE_CODES has only whitespace entries', () => {
    process.env.INVITE_CODES = ' , , ';
    expect(validateInviteCode('anything')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// authRegister endpoint — invite gate behaviour
// ---------------------------------------------------------------------------

describe('authRegister — invite gate', () => {
  it('issues a token when INVITE_CODES is not set (no gate)', async () => {
    delete process.env.INVITE_CODES;
    const res = await authRegister(makeRequest(), makeContext());
    expect(res.status).toBe(200);
    expect((res.jsonBody as Record<string, unknown>).token).toBeTruthy();
  });

  it('returns 403 when INVITE_CODES is set and no code is provided', async () => {
    process.env.INVITE_CODES = 'BURRITO-ALICE-01';
    const res = await authRegister(makeRequest(), makeContext());
    expect(res.status).toBe(403);
    expect((res.jsonBody as Record<string, unknown>).error).toBe('invalid-invite-code');
  });

  it('returns 403 for an invalid invite code', async () => {
    process.env.INVITE_CODES = 'BURRITO-ALICE-01';
    const res = await authRegister(makeRequest({ inviteCode: 'WRONG-CODE' }), makeContext());
    expect(res.status).toBe(403);
    expect((res.jsonBody as Record<string, unknown>).error).toBe('invalid-invite-code');
  });

  it('issues a token for a valid invite code', async () => {
    process.env.INVITE_CODES = 'BURRITO-ALICE-01,BURRITO-BOB-02';
    const res = await authRegister(makeRequest({ inviteCode: 'BURRITO-ALICE-01' }), makeContext());
    expect(res.status).toBe(200);
    expect((res.jsonBody as Record<string, unknown>).token).toBeTruthy();
  });

  it('accepts any code in the list', async () => {
    process.env.INVITE_CODES = 'BURRITO-ALICE-01,BURRITO-BOB-02';
    const res = await authRegister(makeRequest({ inviteCode: 'BURRITO-BOB-02' }), makeContext());
    expect(res.status).toBe(200);
  });

  it('returns 403 when body cannot be parsed (no JSON body)', async () => {
    process.env.INVITE_CODES = 'BURRITO-ALICE-01';
    const res = await authRegister(makeRequest(), makeContext());
    expect(res.status).toBe(403);
  });

  it('is case-sensitive — lowercase code is rejected', async () => {
    process.env.INVITE_CODES = 'BURRITO-ALICE-01';
    const res = await authRegister(makeRequest({ inviteCode: 'burrito-alice-01' }), makeContext());
    expect(res.status).toBe(403);
  });
});
