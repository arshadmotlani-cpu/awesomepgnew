import { NextRequest, NextResponse } from 'next/server';
import { getCustomerSession } from '@/src/lib/auth/session';
import { submitPaymentRecord } from '@/src/services/qrPayments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const session = await getCustomerSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: 'Sign in required.' }, { status: 401 });
  }

  let body: {
    pgId?: string;
    categoryId?: string;
    amountPaise?: number;
    month?: string;
    paymentScreenshotUrl?: string;
    transactionRef?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.pgId || !body.categoryId || !body.paymentScreenshotUrl) {
    return NextResponse.json(
      { ok: false, message: 'pgId, categoryId, and paymentScreenshotUrl are required.' },
      { status: 400 },
    );
  }

  const amountPaise = Number(body.amountPaise);
  if (!Number.isFinite(amountPaise) || amountPaise <= 0) {
    return NextResponse.json({ ok: false, message: 'Valid amount is required.' }, { status: 400 });
  }

  try {
    const record = await submitPaymentRecord({
      pgId: body.pgId,
      categoryId: body.categoryId,
      customerId: session.customerId,
      amountPaise: Math.round(amountPaise),
      month: body.month,
      paymentScreenshotUrl: body.paymentScreenshotUrl,
      transactionRef: body.transactionRef,
    });
    return NextResponse.json({ ok: true, record });
  } catch (err) {
    return NextResponse.json(
      { ok: false, message: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
}

export async function GET(req: NextRequest) {
  const session = await getCustomerSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: 'Sign in required.' }, { status: 401 });
  }

  const pgId = req.nextUrl.searchParams.get('pgId');
  if (!pgId) {
    return NextResponse.json({ ok: false, message: 'pgId is required.' }, { status: 400 });
  }

  const status = req.nextUrl.searchParams.get('status');
  const month = req.nextUrl.searchParams.get('month');
  const categoryId = req.nextUrl.searchParams.get('categoryId');

  const { listCustomerPaymentsForPg } = await import('@/src/services/qrPayments');
  const records = await listCustomerPaymentsForPg(session.customerId, pgId, {
    status:
      status === 'pending' || status === 'approved' || status === 'rejected' ? status : undefined,
    month: month || undefined,
    categoryId: categoryId || undefined,
  });

  return NextResponse.json({ ok: true, records });
}
