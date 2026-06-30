import { NextResponse } from 'next/server';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import {
  getActiveElectricityBillGenerationJob,
  getElectricityBillGenerationJob,
} from '@/src/services/electricityBillGenerationJobs';

export async function GET(
  request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  try {
    await requireAdminPermission('electricity:write');
  } catch {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { jobId } = await context.params;
  const { searchParams } = new URL(request.url);
  const roomId = searchParams.get('roomId');
  const billingMonth = searchParams.get('billingMonth');

  if (jobId === 'active' && roomId && billingMonth) {
    const job = await getActiveElectricityBillGenerationJob({ roomId, billingMonth });
    return NextResponse.json({ ok: true, job });
  }

  const job = await getElectricityBillGenerationJob(jobId);
  if (!job) {
    return NextResponse.json({ ok: false, error: 'Job not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true, job });
}
