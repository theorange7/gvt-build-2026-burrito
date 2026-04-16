import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { classify } from '@/lib/ai/classify';
import { ContributionCategorySchema, RawDataSchema, parseDateInput, safeJsonParse, zodErrorResponse } from '@/lib/validation';

const createSchema = z.object({
  userId: z.string().min(1),
  freeText: z.string().trim().min(3),
  occurredAt: z.string().optional(),
  category: ContributionCategorySchema.exclude(['other']).optional(),
});

export async function GET() {
  const contributions = await db.contribution.findMany({
    where: { userId: 'demo-user' },
    orderBy: { occurredAt: 'desc' },
  });

  return NextResponse.json(
    contributions.map((item) => {
      const rawData = safeJsonParse(item.rawData, RawDataSchema);

      return {
        ...item,
        rawData: rawData.success
          ? rawData.data
          : { recovery: 'rawData_parse_failed', originalValue: item.rawData },
      };
    }),
  );
}

export async function POST(request: NextRequest) {
  const json = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json(zodErrorResponse(parsed.error), { status: 422 });
  }

  const occurredAt = parsed.data.occurredAt ? parseDateInput(parsed.data.occurredAt) : new Date();

  if (!occurredAt) {
    return NextResponse.json(
      { error: 'occurredAt must be a valid date string.' },
      { status: 422 },
    );
  }

  try {
    const classified = await classify({ source: 'manual', freeText: parsed.data.freeText });
    const contribution = await db.contribution.create({
      data: {
        userId: parsed.data.userId,
        source: 'manual',
        category: parsed.data.category ?? classified.category,
        signal: classified.signal,
        rawData: JSON.stringify({ source: 'manual', freeText: parsed.data.freeText }),
        occurredAt,
        weight: classified.weight,
        externalId: `manual:${crypto.randomUUID()}`,
      },
    });

    const rawData = safeJsonParse(contribution.rawData, RawDataSchema);

    return NextResponse.json({
      ...contribution,
      rawData: rawData.success
        ? rawData.data
        : { recovery: 'rawData_parse_failed', originalValue: contribution.rawData },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create contribution.' },
      { status: 500 },
    );
  }
}
