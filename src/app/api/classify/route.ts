/*
 * PRIVACY: This endpoint is stateless. Request bodies, AI inputs, and AI
 * outputs are forwarded to Anthropic and returned to the caller. They MUST NOT
 * be persisted, logged with payloads, or aggregated. Do not add any DB import
 * or request-body logger to this file.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { classify } from '@/lib/ai/classify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  freeText: z.string().min(3),
  source: z.enum(['github', 'jira', 'slack', 'confluence', 'manual']).default('manual'),
});

export async function POST(request: NextRequest) {
  try {
    const body = schema.parse(await request.json());
    const result = await classify({ source: body.source, freeText: body.freeText });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to classify.' },
      { status: 500 },
    );
  }
}
