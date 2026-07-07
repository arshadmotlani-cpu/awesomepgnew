import { NextRequest, NextResponse } from 'next/server';
import { getCustomerSession } from '@/src/lib/auth/session';
import { submitBookingPaymentRecord } from '@/src/services/qrPayments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const session = await getCustomerSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: 'Sign in required.' }, { status: 401 });
  }

  let body: {
    bookingCode?: string;
    amountPaise?: number;
    paymentScreenshotUrl?: string;
    transactionRef?: string;
    membershipId?: string;
    membershipAmountPaise?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.bookingCode || !body.paymentScreenshotUrl) {
    return NextResponse.json(
      { ok: false, message: 'bookingCode and paymentScreenshotUrl are required.' },
      { status: 400 },
    );
  }

  const amountPaise = Number(body.amountPaise);
  if (!Number.isFinite(amountPaise) || amountPaise <= 0) {
    return NextResponse.json({ ok: false, message: 'Valid amount is required.' }, { status: 400 });
  }

  try {
    const record = await submitBookingPaymentRecord({
      bookingCode: body.bookingCode,
      customerId: session.customerId,
      amountPaise: Math.round(amountPaise),
      paymentScreenshotUrl: body.paymentScreenshotUrl,
      transactionRef: body.transactionRef,
      membershipId: body.membershipId,
      membershipAmountPaise: body.membershipAmountPaise
        ? Math.round(body.membershipAmountPaise)
        : undefined,
    });
    return NextResponse.json({
      ok: true as const,
      recordId: String(record.id),
      bookingCode: body.bookingCode,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, message: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
}
