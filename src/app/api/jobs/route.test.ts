// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({
  db: {
    wrapJob: {
      create: vi.fn(),
      update: vi.fn(),
    },
    contribution: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock('@/lib/ai/generate', () => ({
  generateWrap: vi.fn(),
}));

import { POST } from './route';
import { db } from '@/lib/db';
import { generateWrap } from '@/lib/ai/generate';

const mockedDb = vi.mocked(db, true);
const mockedGenerateWrap = vi.mocked(generateWrap);

describe('POST /api/jobs', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns 422 for an invalid date window', async () => {
    const response = await POST(
      new Request('http://localhost/api/jobs', {
        method: 'POST',
        body: JSON.stringify({
          userId: 'demo-user',
          mode: 'snapshot',
          windowStart: '2025-06-30',
          windowEnd: '2025-04-01',
        }),
      }) as never,
    );

    expect(response.status).toBe(422);
    expect(mockedDb.wrapJob.create).not.toHaveBeenCalled();
  });

  it('creates and completes a job for a valid request', async () => {
    mockedDb.wrapJob.create.mockResolvedValue({ id: 'job-1' } as never);
    mockedDb.contribution.findMany.mockResolvedValue([
      {
        id: 'c1',
        userId: 'demo-user',
        source: 'github',
        category: 'delivery',
        signal: 'Shipped the permits dashboard.',
        rawData: JSON.stringify({ source: 'github' }),
        occurredAt: new Date('2025-05-01T00:00:00.000Z'),
        weight: 4,
        externalId: null,
        externalUrl: null,
        createdAt: new Date('2025-05-01T00:00:00.000Z'),
      },
    ] as never);
    mockedGenerateWrap.mockResolvedValue([
      {
        sliceKey: 'velocity',
        headline: 'You kept the work moving.',
        body: 'Momentum stayed visible throughout the window.',
        stat: '1 launch',
        supporting: null,
      },
    ]);
    mockedDb.wrapJob.update.mockResolvedValue({ id: 'job-1' } as never);

    const response = await POST(
      new Request('http://localhost/api/jobs', {
        method: 'POST',
        body: JSON.stringify({
          userId: 'demo-user',
          mode: 'snapshot',
          windowStart: '2025-04-01',
          windowEnd: '2025-06-30',
        }),
      }) as never,
    );

    expect(response.status).toBe(200);
    expect(mockedDb.wrapJob.create).toHaveBeenCalledTimes(1);
    expect(mockedGenerateWrap).toHaveBeenCalledTimes(1);
    expect(mockedDb.wrapJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'complete' }),
      }),
    );
  });

  it('marks the job as failed when generation throws', async () => {
    mockedDb.wrapJob.create.mockResolvedValue({ id: 'job-2' } as never);
    mockedDb.contribution.findMany.mockResolvedValue([] as never);
    mockedGenerateWrap.mockRejectedValue(new Error('generation failed'));
    mockedDb.wrapJob.update.mockResolvedValue({ id: 'job-2' } as never);

    const response = await POST(
      new Request('http://localhost/api/jobs', {
        method: 'POST',
        body: JSON.stringify({
          userId: 'demo-user',
          mode: 'snapshot',
          windowStart: '2025-04-01',
          windowEnd: '2025-06-30',
        }),
      }) as never,
    );

    expect(response.status).toBe(500);
    expect(mockedDb.wrapJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'job-2' },
        data: expect.objectContaining({ status: 'failed' }),
      }),
    );
  });
});
