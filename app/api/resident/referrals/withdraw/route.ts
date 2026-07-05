import { NextResponse } from 'next/server';
import { requireCustomerSession } from '@/src/lib/auth/guards';
import { createReferralWithdrawalRequest } from '@/src/services/referralWithdrawals';

export async function POST(req: Request) {
  const session = await requireCustomerSession();
  const body = (await req.json()) as { upiId?: string; amountPaise?: number };
  const result = await createReferralWithdrawalRequest({
    customerId: session.customerId,
    upiId: body.upiId ?? '',
    amountPaise: body.amountPaise ?? 0,
  });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true, requestId: result.requestId });
}
