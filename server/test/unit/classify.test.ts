import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { classify } from '../../src/ai/classify';

const originalKey = process.env.ANTHROPIC_API_KEY;

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = 'test-key';
});

afterEach(() => {
  process.env.ANTHROPIC_API_KEY = originalKey;
});

describe('ai/classify', () => {
  it('parses a well-formed Claude response', async () => {
    server.use(
      http.post('https://api.anthropic.com/v1/messages', () =>
        HttpResponse.json({
          content: [{ type: 'text', text: JSON.stringify({ signal: 'shipped X', category: 'delivery', weight: 4 }) }],
        }),
      ),
    );
    const out = await classify({ source: 'manual', freeText: 'i shipped X' });
    expect(out).toEqual({ signal: 'shipped X', category: 'delivery', weight: 4 });
  });

  it('clamps weight to 1..5', async () => {
    server.use(
      http.post('https://api.anthropic.com/v1/messages', () =>
        HttpResponse.json({
          content: [{ type: 'text', text: JSON.stringify({ signal: 's', category: 'delivery', weight: 99 }) }],
        }),
      ),
    );
    const out = await classify({ source: 'manual', freeText: 'x' });
    expect(out.weight).toBe(5);
  });

  it('falls back to defaults when AI returns invalid JSON', async () => {
    server.use(
      http.post('https://api.anthropic.com/v1/messages', () =>
        HttpResponse.json({ content: [{ type: 'text', text: 'not json at all' }] }),
      ),
    );
    const out = await classify({ source: 'manual', freeText: 'A long contribution text that should be truncated to 200 chars or less but in this test it is short' });
    expect(out.category).toBe('other');
    expect(out.weight).toBe(2);
    expect(out.signal.length).toBeLessThanOrEqual(200);
  });

  it('falls back when the API errors', async () => {
    server.use(
      http.post('https://api.anthropic.com/v1/messages', () =>
        new HttpResponse('boom', { status: 500 }),
      ),
    );
    const out = await classify({ source: 'manual', freeText: 'something' });
    expect(out).toEqual({ signal: 'something', category: 'other', weight: 2 });
  });
});
