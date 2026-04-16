import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import type { Contribution, WrapMode } from '@/lib/types';
import { generateWrap } from '@/lib/ai/generate';
import {
  ContributionCategorySchema,
  ContributionSourceSchema,
  RawDataSchema,
  WrapModeSchema,
  parseDateInput,
  safeJsonParse,
  zodErrorResponse,
} from '@/lib/validation';

const requestSchema = z
  .object({
    userId: z.string().min(1),
    mode: WrapModeSchema,
    windowStart: z.string().min(1),
    windowEnd: z.string().min(1),
  })
  .superRefine((value, ctx) => {
    const windowStart = parseDateInput(value.windowStart);
    const windowEnd = parseDateInput(value.windowEnd);

    if (!windowStart) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['windowStart'],
        message: 'windowStart must be a valid date string.',
      });
    }

    if (!windowEnd) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['windowEnd'],
        message: 'windowEnd must be a valid date string.',
      });
    }

    if (windowStart && windowEnd && windowStart > windowEnd) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['windowEnd'],
        message: 'windowEnd must be on or after windowStart.',
      });
    }
  });

export async function POST(request: NextRequest) {
  const json = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json(zodErrorResponse(parsed.error), { status: 422 });
  }

  const windowStart = parseDateInput(parsed.data.windowStart);
  const windowEnd = parseDateInput(parsed.data.windowEnd);

  if (!windowStart || !windowEnd) {
    return NextResponse.json(
      { error: 'windowStart and windowEnd must both be valid dates.' },
      { status: 422 },
    );
  }

  let job: { id: string } | null = null;

  try {
    job = await db.wrapJob.create({
      data: {
        userId: parsed.data.userId,
        mode: parsed.data.mode,
        status: 'processing',
        windowStart,
        windowEnd,
      },
      select: { id: true },
    });

    const contributions = await db.contribution.findMany({
      where: {
        userId: parsed.data.userId,
        occurredAt: {
          gte: windowStart,
          lte: windowEnd,
        },
      },
      orderBy: { occurredAt: 'desc' },
    });

    const normalizedContributions: Contribution[] = contributions.map((item) => {
      const rawData = safeJsonParse(item.rawData, RawDataSchema);
      const source = ContributionSourceSchema.safeParse(item.source);
      const category = ContributionCategorySchema.safeParse(item.category);

      return {
        id: item.id,
        userId: item.userId,
        source: source.success ? source.data : 'manual',
        category: category.success ? category.data : 'other',
        signal: item.signal,
        rawData: rawData.success
          ? rawData.data
          : { recovery: 'rawData_parse_failed', originalValue: item.rawData },
        occurredAt: item.occurredAt,
        weight: item.weight,
        externalId: item.externalId ?? undefined,
        externalUrl: item.externalUrl ?? undefined,
        createdAt: item.createdAt,
      };
    });

    const sliceContent = await generateWrap({
      contributions: normalizedContributions,
      mode: parsed.data.mode as WrapMode,
      windowStart,
      windowEnd,
    });

    const updated = await db.wrapJob.update({
      where: { id: job.id },
      data: {
        status: 'complete',
        sliceContent: JSON.stringify(sliceContent),
        errorMessage: null,
      },
    });

    return NextResponse.json({
      jobId: updated.id,
      status: 'complete',
      sliceContent,
    });
  } catch (error) {
    if (job) {
      await db.wrapJob.update({
        where: { id: job.id },
        data: {
          status: 'failed',
          errorMessage: error instanceof Error ? error.message : 'Wrap generation failed.',
        },
      });
    }

    return NextResponse.json(
      { errorMessage: error instanceof Error ? error.message : 'Wrap generation failed.' },
      { status: 500 },
    );
  }
}
