import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { classify } from '@/lib/ai/classify';

const createSchema = z.object({
  userId: z.string(),
  freeText: z.string().min(3),
  occurredAt: z.string().optional(),
  category: z.enum(['delivery', 'collaboration', 'mentorship', 'process', 'leadership']).optional(),
});

export async function GET() {
  const contributions = await db.contribution.findMany({
    where: { userId: 'demo-user' },
    orderBy: { occurredAt: 'desc' },
  });

  return NextResponse.json(
    contributions.map((item) => ({
      ...item,
      rawData: JSON.parse(item.rawData),
    })),
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = createSchema.parse(await request.json());
    const classified = await classify({ source: 'manual', freeText: body.freeText });
    const contribution = await db.contribution.create({
      data: {
        userId: body.userId,
        source: 'manual',
        category: body.category ?? classified.category,
        signal: classified.signal,
        rawData: JSON.stringify({ source: 'manual', freeText: body.freeText }),
        occurredAt: body.occurredAt ? new Date(body.occurredAt) : new Date(),
        weight: classified.weight,
        externalId: `manual:${crypto.randomUUID()}`,
      },
    });

    return NextResponse.json({
      ...contribution,
      rawData: JSON.parse(contribution.rawData),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create contribution.' },
      { status: 500 },
    );
  }
}
