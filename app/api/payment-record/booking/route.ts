import { randomUUID } from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/src/db/client';
import { bedReserveHolds, bookings, pgPaymentRecords } from '@/src/db/schema';
import { getCustomerSession } from '@/src/lib/auth/session';
import { submitBookingPaymentRecord } from '@/src/services/qrPayments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type PaymentRecordBookingBody = {
  bookingCode?: string;
  amountPaise?: number;
  paymentScreenshotUrl?: string;
  transactionRef?: string;
  membershipId?: string;
  membershipAmountPaise?: number;
};

async function resolvePaymentSubmitContext(bookingCode?: string, customerId?: string) {
  if (!bookingCode) {
    return {
      bookingId: null as string | null,
      paymentRecordId: null as string | null,
      reserveHoldId: null as string | null,
    };
  }

  const [booking] = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(eq(bookings.bookingCode, bookingCode))
    .limit(1);
  if (!booking) {
    return { bookingId: null, paymentRecordId: null, reserveHoldId: null };
  }

  const [paymentRecord] = await db
    .select({ id: pgPaymentRecords.id })
    .from(pgPaymentRecords)
    .where(eq(pgPaymentRecords.bookingId, booking.id))
    .orderBy(desc(pgPaymentRecords.createdAt))
    .limit(1);

  const [reserveHold] = await db
    .select({ id: bedReserveHolds.id })
    .from(bedReserveHolds)
    .where(eq(bedReserveHolds.bookingId, booking.id))
    .limit(1);

  return {
    bookingId: booking.id,
    customerId,
    paymentRecordId: paymentRecord?.id ?? null,
    reserveHoldId: reserveHold?.id ?? null,
  };
}

function jsonError(
  message: string,
  errorId: string,
  status: number,
): NextResponse<{ ok: false; message: string; errorId: string }> {
  return NextResponse.json({ ok: false, message, errorId }, { status });
}

export async function POST(req: NextRequest) {
  const errorId = randomUUID();
  let bookingCode: string | undefined;
  let customerId: string | undefined;
  let bookingId: string | null = null;
  let paymentRecordId: string | null = null;
  let reserveHoldId: string | null = null;

  try {
    const session = await getCustomerSession();
    if (!session) {
      return jsonError('Sign in required.', errorId, 401);
    }
    customerId = session.customerId;

    let body: PaymentRecordBookingBody;
    try {
      body = await req.json();
    } catch {
      return jsonError('Invalid JSON', errorId, 400);
    }

    bookingCode = body.bookingCode;
    if (!body.bookingCode || !body.paymentScreenshotUrl) {
      return jsonError('bookingCode and paymentScreenshotUrl are required.', errorId, 400);
    }

    const amountPaise = Number(body.amountPaise);
    if (!Number.isFinite(amountPaise) || amountPaise <= 0) {
      return jsonError('Valid amount is required.', errorId, 400);
    }

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
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;

    try {
      const ctx = await resolvePaymentSubmitContext(bookingCode, customerId);
      bookingId = ctx.bookingId;
      paymentRecordId = ctx.paymentRecordId;
      reserveHoldId = ctx.reserveHoldId;
    } catch (lookupErr) {
      console.error('[payment-record/booking] context lookup failed', {
        errorId,
        lookupErr,
      });
    }

    console.error('[payment-record/booking] submit failed', {
      errorId,
      error: message,
      stack,
      bookingCode,
      bookingId,
      customerId,
      paymentRecordId,
      reserveHoldId,
    });

    const status = message === 'Access denied.' || message === 'Booking not found.' ? 403 : 400;
    return jsonError(message, errorId, status);
  }
}
