import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { SliceContentArraySchema, safeJsonParse } from '@/lib/validation';

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  const job = await db.wrapJob.findUnique({ where: { id: params.id } });

  if (!job) {
    return NextResponse.json({ error: 'Job not found.' }, { status: 404 });
  }

  if (!job.sliceContent) {
    return NextResponse.json({ ...job, sliceContent: null });
  }

  const parsed = safeJsonParse(job.sliceContent, SliceContentArraySchema);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Stored wrap content is invalid for this job.' },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ...job,
    sliceContent: parsed.data,
  });
}
