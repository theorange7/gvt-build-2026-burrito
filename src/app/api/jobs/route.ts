import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import type { Contribution, WrapMode } from '@/lib/types';
import { generateWrap } from '@/lib/ai/generate';

const requestSchema = z.object({
  userId: z.string(),
  mode: z.enum(['snapshot', 'year-end']),
  windowStart: z.string(),
  windowEnd: z.string(),
});

export async function POST(request: NextRequest) {
  const payload = requestSchema.parse(await request.json());
  const job = await db.wrapJob.create({
    data: {
      userId: payload.userId,
      mode: payload.mode,
      status: 'processing',
      windowStart: new Date(payload.windowStart),
      windowEnd: new Date(payload.windowEnd),
    },
  });

  try {
    const contributions = await db.contribution.findMany({
      where: {
        userId: payload.userId,
        occurredAt: {
          gte: new Date(payload.windowStart),
          lte: new Date(payload.windowEnd),
        },
      },
      orderBy: { occurredAt: 'desc' },
    });

    const sliceContent = await generateWrap({
      contributions: contributions.map((item) => ({
        ...item,
        rawData: JSON.parse(item.rawData),
      })) as Contribution[],
      mode: payload.mode as WrapMode,
      windowStart: new Date(payload.windowStart),
      windowEnd: new Date(payload.windowEnd),
    });

    const updated = await db.wrapJob.update({
      where: { id: job.id },
      data: {
        status: 'complete',
        sliceContent: JSON.stringify(sliceContent),
      },
    });

    return NextResponse.json({
      jobId: updated.id,
      status: 'complete',
      sliceContent,
    });
  } catch (error) {
    await db.wrapJob.update({
      where: { id: job.id },
      data: {
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : 'Wrap generation failed.',
      },
    });

    return NextResponse.json(
      { errorMessage: error instanceof Error ? error.message : 'Wrap generation failed.' },
      { status: 500 },
    );
  }
}
