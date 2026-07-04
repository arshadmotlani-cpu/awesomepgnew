import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/src/lib/auth/session';
import { PAYMENT_ALREADY_APPROVED_MESSAGE } from '@/src/lib/operations/paymentReviewMessages';
import { reviewPaymentRecord } from '@/src/services/qrPayments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await ctx.params;
  let body: { status?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: 'Invalid JSON' }, { status: 400 });
  }

  if (body.status !== 'approved' && body.status !== 'rejected') {
    return NextResponse.json(
      { ok: false, message: 'status must be approved or rejected.' },
      { status: 400 },
    );
  }

  try {
    const result = await reviewPaymentRecord(session, id, body.status);
    if (result.outcome === 'already_approved') {
      return NextResponse.json({
        ok: true,
        message: PAYMENT_ALREADY_APPROVED_MESSAGE,
        alreadyApproved: true,
      });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { ok: false, message: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
}
