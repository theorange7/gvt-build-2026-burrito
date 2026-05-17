import { describe, expect, it } from 'vitest';
import { safeError, UpstreamError } from '../../src/privacy';

describe('safeError + UpstreamError (#6)', () => {
  it('UpstreamError with an allowlisted code passes through', () => {
    expect(safeError(new UpstreamError('rate_limited', 429))).toEqual({
      code: 'rate_limited',
      status: 429,
    });
  });

  it('UpstreamError with a non-allowlisted code collapses to unknown (defense in depth)', () => {
    // Casts past the type guard — the runtime allowlist is the actual barrier.
    const bogus = new UpstreamError('arbitrary_code' as never, 418);
    expect(safeError(bogus)).toEqual({ code: 'unknown', status: 418 });
  });

  it('a plain Error never surfaces its message', () => {
    const sensitive = new Error('SECRET-prompt-fragment-and-stack-trace');
    const safe = safeError(sensitive);
    expect(safe).toEqual({ code: 'unknown' });
    expect(JSON.stringify(safe)).not.toContain('SECRET');
  });

  it('Errors with a status property map by HTTP code', () => {
    const e500 = Object.assign(new Error('boom'), { status: 503 });
    expect(safeError(e500)).toEqual({ code: 'upstream_5xx', status: 503 });

    const e404 = Object.assign(new Error('boom'), { statusCode: 404 });
    expect(safeError(e404)).toEqual({ code: 'not_found', status: 404 });

    const e429 = Object.assign(new Error('boom'), { status: 429 });
    expect(safeError(e429)).toEqual({ code: 'rate_limited', status: 429 });

    const e401 = Object.assign(new Error('boom'), { status: 401 });
    expect(safeError(e401)).toEqual({ code: 'auth_failed', status: 401 });
  });

  it('ZodError shape maps to invalid_payload', () => {
    const zErr = Object.assign(new Error('oops'), { name: 'ZodError' });
    expect(safeError(zErr)).toEqual({ code: 'invalid_payload' });
  });

  it('non-Error inputs collapse to unknown', () => {
    expect(safeError('str')).toEqual({ code: 'unknown' });
    expect(safeError(null)).toEqual({ code: 'unknown' });
    expect(safeError(42)).toEqual({ code: 'unknown' });
  });

  it('UpstreamError.message is fixed and contains no upstream content', () => {
    const err = new UpstreamError('upstream_5xx', 502);
    expect(err.message).toBe('upstream-error:upstream_5xx');
    expect(err.message).not.toMatch(/[A-Za-z]\.[a-z]+/); // no embedded URLs
  });

  it("accepts 'ollama_unreachable' as an allowlisted code and preserves the hint", () => {
    const err = new UpstreamError(
      'ollama_unreachable',
      undefined,
      "Ollama isn't reachable at http://localhost:11434. Start it with `ollama serve` and pull the model.",
    );
    const safe = safeError(err);
    expect(safe.code).toBe('ollama_unreachable');
    expect(safe.status).toBeUndefined();
    expect(safe.hint).toContain('http://localhost:11434');
  });

  it('preserves a hint on not_found (used by the Ollama adapter for `ollama pull <model>` suggestions)', () => {
    const err = new UpstreamError('not_found', 404, 'Ollama model not found. Run `ollama pull llama3.1:8b` on the host.');
    expect(safeError(err)).toEqual({
      code: 'not_found',
      status: 404,
      hint: 'Ollama model not found. Run `ollama pull llama3.1:8b` on the host.',
    });
  });

  it('drops the hint when the code collapses to unknown (defense in depth)', () => {
    const bogus = new UpstreamError('arbitrary_code' as never, 418, 'leaky http://internal');
    const safe = safeError(bogus);
    expect(safe).toEqual({ code: 'unknown', status: 418 });
    expect(JSON.stringify(safe)).not.toContain('internal');
  });

  it('omits hint entirely when the UpstreamError did not set one', () => {
    const safe = safeError(new UpstreamError('upstream_5xx', 502));
    expect(safe).toEqual({ code: 'upstream_5xx', status: 502 });
    expect('hint' in safe).toBe(false);
  });
});
