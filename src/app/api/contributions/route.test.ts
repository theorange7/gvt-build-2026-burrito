// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({
  db: {
    contribution: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

vi.mock('@/lib/ai/classify', () => ({
  classify: vi.fn(),
}));

import { GET, POST } from './route';
import { db } from '@/lib/db';
import { classify } from '@/lib/ai/classify';

const mockedDb = vi.mocked(db, true);
const mockedClassify = vi.mocked(classify);

describe('/api/contributions', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns stored contributions with parsed rawData', async () => {
    mockedDb.contribution.findMany.mockResolvedValue([
      {
        id: 'c1',
        userId: 'demo-user',
        source: 'manual',
        category: 'process',
        signal: 'Documented release steps.',
        rawData: JSON.stringify({ source: 'manual' }),
        occurredAt: new Date('2025-05-01T00:00:00.000Z'),
        weight: 3,
        externalId: null,
        externalUrl: null,
        createdAt: new Date('2025-05-01T00:00:00.000Z'),
      },
    ] as never);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body[0].rawData).toEqual({ source: 'manual' });
  });

  it('returns 422 for invalid payloads', async () => {
    const response = await POST(
      new Request('http://localhost/api/contributions', {
        method: 'POST',
        body: JSON.stringify({ userId: 'demo-user', freeText: 'ok', occurredAt: 'invalid-date' }),
      }) as never,
    );

    expect(response.status).toBe(422);
    expect(mockedClassify).not.toHaveBeenCalled();
  });

  it('creates a contribution and respects a manual category override', async () => {
    mockedClassify.mockResolvedValue({
      signal: 'Summarized the quarterly roadmap.',
      category: 'other',
      weight: 2,
    });

    mockedDb.contribution.create.mockResolvedValue({
      id: 'c2',
      userId: 'demo-user',
      source: 'manual',
      category: 'leadership',
      signal: 'Summarized the quarterly roadmap.',
      rawData: JSON.stringify({ source: 'manual' }),
      occurredAt: new Date('2025-05-10T00:00:00.000Z'),
      weight: 2,
      externalId: 'manual:1',
      externalUrl: null,
      createdAt: new Date('2025-05-10T00:00:00.000Z'),
    } as never);

    const response = await POST(
      new Request('http://localhost/api/contributions', {
        method: 'POST',
        body: JSON.stringify({
          userId: 'demo-user',
          freeText: 'Drafted the roadmap review memo.',
          occurredAt: '2025-05-10',
          category: 'leadership',
        }),
      }) as never,
    );

    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockedDb.contribution.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ category: 'leadership' }),
      }),
    );
    expect(body.category).toBe('leadership');
  });
});
