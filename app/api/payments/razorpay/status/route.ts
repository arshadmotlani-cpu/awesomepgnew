import { NextRequest } from 'next/server';
import { getCustomerSession } from '@/src/lib/auth/session';
import { requireCustomerOwnsBookingCode } from '@/src/lib/auth/guards';
import { getBookingByCode } from '@/src/db/queries/customer';

export const dynamic = 'force-dynamic';

/**
 * Lightweight poll endpoint for the payment-success page while the webhook
 * or checkout-verify handler flips the booking to confirmed.
 */
export async function GET(req: NextRequest) {
  const session = await getCustomerSession();
  if (!session) {
    return Response.json({ ok: false, reason: 'Sign in required.' }, { status: 401 });
  }

  const bookingCode = req.nextUrl.searchParams.get('booking_code')?.trim();
  if (!bookingCode || !/^APG-\d{4}-\d+$/.test(bookingCode)) {
    return Response.json({ ok: false, reason: 'Invalid booking code.' }, { status: 400 });
  }

  try {
    await requireCustomerOwnsBookingCode(session, bookingCode);
  } catch {
    return Response.json({ ok: false, reason: 'Access denied.' }, { status: 403 });
  }

  const result = await getBookingByCode(bookingCode);
  if (!result.ok || !result.data) {
    return Response.json({ ok: false, reason: 'Booking not found.' }, { status: 404 });
  }

  return Response.json({
    ok: true,
    bookingCode,
    status: result.data.status,
    confirmed: result.data.status === 'confirmed',
  });
}
