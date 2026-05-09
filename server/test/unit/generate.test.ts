import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { generateWrap } from '../../src/ai/generate';
import { asContributions } from '../fixtures/contributions';
import { pickResponseFor } from '../fixtures/anthropic';

const originalKey = process.env.ANTHROPIC_API_KEY;

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = 'test-key';
});

afterEach(() => {
  process.env.ANTHROPIC_API_KEY = originalKey;
});

describe('ai/generate.generateWrap', () => {
  it('returns 10 slices in stable order using the default mock', async () => {
    const result = await generateWrap({
      contributions: asContributions(),
      mode: 'year-end',
      windowStart: new Date('2025-01-01'),
      windowEnd: new Date('2025-12-31'),
    });
    expect(result).toHaveLength(10);
    expect(result.map((s) => s.sliceKey)).toEqual([
      'launches_shipped',
      'velocity',
      'cross_team_impact',
      'deep_work_streak',
      'mentorship',
      'initiative',
      'collaboration_style',
      'consistency',
      'highlight_reel',
      'identity',
    ]);
    expect(result.every((s) => s.headline.length > 0 && s.body.length > 0)).toBe(true);
  });

  it('falls back per-slice when one Claude call fails', async () => {
    let calls = 0;
    server.use(
      http.post('https://api.anthropic.com/v1/messages', async ({ request }) => {
        calls += 1;
        const body = (await request.json()) as { system: string };
        if (calls === 3) return new HttpResponse('boom', { status: 500 });
        return HttpResponse.json({
          content: [{ type: 'text', text: JSON.stringify(pickResponseFor(body.system)) }],
        });
      }),
    );

    const result = await generateWrap({
      contributions: asContributions(),
      mode: 'snapshot',
      windowStart: new Date('2025-01-01'),
      windowEnd: new Date('2025-12-31'),
    });
    expect(result).toHaveLength(10);
    expect(result.every((s) => s.sliceKey && typeof s.headline === 'string' && typeof s.body === 'string')).toBe(true);
  });

  it('still returns 10 slices when every call fails', async () => {
    server.use(
      http.post('https://api.anthropic.com/v1/messages', () =>
        new HttpResponse('always boom', { status: 500 }),
      ),
    );
    const result = await generateWrap({
      contributions: asContributions(),
      mode: 'snapshot',
      windowStart: new Date('2025-01-01'),
      windowEnd: new Date('2025-12-31'),
    });
    expect(result).toHaveLength(10);
  });
});
