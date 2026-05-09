import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  decideAccept,
  decideBusy,
  maxConcurrency,
  perInstallLimit,
  registerRateLimitPerHour,
  resultTtlHours,
} from '../../src/queue/concurrency';

const originalEnv = { ...process.env };

beforeEach(() => {
  delete process.env.WRAP_MAX_CONCURRENCY;
  delete process.env.WRAP_PER_INSTALL_LIMIT;
  delete process.env.WRAP_RESULT_TTL_HOURS;
  delete process.env.WRAP_REGISTER_RATE_LIMIT_PER_HOUR;
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe('queue/concurrency', () => {
  it('returns sane defaults when env is unset', () => {
    expect(maxConcurrency()).toBe(8);
    expect(perInstallLimit()).toBe(1);
    expect(resultTtlHours()).toBe(24);
    expect(registerRateLimitPerHour()).toBe(10);
  });

  it('reads positive integers from env', () => {
    process.env.WRAP_MAX_CONCURRENCY = '4';
    process.env.WRAP_PER_INSTALL_LIMIT = '3';
    expect(maxConcurrency()).toBe(4);
    expect(perInstallLimit()).toBe(3);
  });

  it('falls back to defaults on garbage', () => {
    process.env.WRAP_MAX_CONCURRENCY = 'banana';
    process.env.WRAP_PER_INSTALL_LIMIT = '0';
    expect(maxConcurrency()).toBe(8);
    expect(perInstallLimit()).toBe(1);
  });

  it('decideBusy flags busy at or above the cap', () => {
    process.env.WRAP_MAX_CONCURRENCY = '2';
    expect(decideBusy(0)).toBe(false);
    expect(decideBusy(1)).toBe(false);
    expect(decideBusy(2)).toBe(true);
    expect(decideBusy(5)).toBe(true);
  });

  it('decideAccept returns false at or above the per-install limit', () => {
    process.env.WRAP_PER_INSTALL_LIMIT = '1';
    expect(decideAccept(0)).toBe(true);
    expect(decideAccept(1)).toBe(false);
    expect(decideAccept(2)).toBe(false);
  });
});
