import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/src/lib/auth/session';
import { listOwnerPayments } from '@/src/services/qrPayments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  }

  const pgId = req.nextUrl.searchParams.get('pgId') || undefined;
  const status = req.nextUrl.searchParams.get('status');
  const month = req.nextUrl.searchParams.get('month') || undefined;

  try {
    const payments = await listOwnerPayments(session, {
      pgId,
      month,
      status:
        status === 'pending' || status === 'approved' || status === 'rejected' ? status : undefined,
    });
    return NextResponse.json({ ok: true, payments });
  } catch (err) {
    return NextResponse.json(
      { ok: false, message: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
}
