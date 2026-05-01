/*
 * PRIVACY: This endpoint is stateless. Request bodies, AI inputs, and AI
 * outputs are forwarded to Anthropic and returned to the caller. They MUST NOT
 * be persisted, logged with payloads, or aggregated. Do not add any DB import
 * or request-body logger to this file.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import type { Contribution, WrapMode } from '@/lib/types';
import { generateWrap } from '@/lib/ai/generate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const contributionSchema = z.object({
  source: z.enum(['github', 'jira', 'slack', 'confluence', 'manual']),
  category: z.enum(['delivery', 'collaboration', 'mentorship', 'process', 'leadership', 'other']),
  signal: z.string(),
  rawData: z.record(z.unknown()),
  occurredAt: z.string(),
  weight: z.number().min(1).max(5),
});

const schema = z.object({
  contributions: z.array(contributionSchema),
  mode: z.enum(['snapshot', 'year-end']),
  windowStart: z.string(),
  windowEnd: z.string(),
});

export async function POST(request: NextRequest) {
  try {
    const body = schema.parse(await request.json());
    const contributions: Contribution[] = body.contributions.map((c, idx) => ({
      id: `transient-${idx}`,
      userId: 'transient',
      source: c.source,
      category: c.category,
      signal: c.signal,
      rawData: c.rawData,
      occurredAt: new Date(c.occurredAt),
      weight: c.weight,
      createdAt: new Date(),
    }));

    const sliceContent = await generateWrap({
      contributions,
      mode: body.mode as WrapMode,
      windowStart: new Date(body.windowStart),
      windowEnd: new Date(body.windowEnd),
    });

    return NextResponse.json({ sliceContent });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Wrap generation failed.' },
      { status: 500 },
    );
  }
}
