import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  const job = await db.wrapJob.findUnique({ where: { id: params.id } });
  if (!job) {
    return NextResponse.json({ error: 'Job not found.' }, { status: 404 });
  }

  return NextResponse.json({
    ...job,
    sliceContent: job.sliceContent ? JSON.parse(job.sliceContent) : null,
  });
}
