'use server';

import { revalidateReservationLifecycleViews } from '@/src/lib/occupancyRevalidate';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { bedReserveHolds } from '@/src/db/schema';
import { cancelBooking } from '@/src/services/bookingLifecycle';
import { getCustomerSession } from '@/src/lib/auth/session';
import { requireCustomerOwnsBookingCode } from '@/src/lib/auth/guards';
import { getBookingByCode } from '@/src/db/queries/customer';
import { convertBedReserveToMonthlyStay } from '@/src/services/bedReserve';

export type CancelActionState =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | {
      status: 'cancelled';
      bookingCode: string;
      refundPaise: number;
      tier: 'full' | 'partial' | 'none';
      hoursBefore: number;
    };

/** Customer-initiated cancellation — requires an active session (Phase 6). */
export async function cancelBookingAction(
  _prev: CancelActionState,
  formData: FormData,
): Promise<CancelActionState> {
  const session = await getCustomerSession();
  if (!session) {
    return { status: 'error', message: 'Sign in required to cancel a booking.' };
  }

  const bookingCode = String(formData.get('bookingCode') ?? '');
  if (!/^APG-\d{4}-\d+$/.test(bookingCode)) {
    return { status: 'error', message: 'Invalid booking code.' };
  }
  const reason = String(formData.get('reason') ?? '').trim();
  if (reason.length < 3) {
    return {
      status: 'error',
      message: 'Please share a short reason (3+ characters) for the cancellation.',
    };
  }

  try {
    await requireCustomerOwnsBookingCode(session, bookingCode);
  } catch {
    return { status: 'error', message: 'Booking not found or access denied.' };
  }

  const result = await cancelBooking({
    bookingCode,
    reason,
    actor: { kind: 'customer', customerId: session.customerId },
  });

  if (!result.ok) {
    return { status: 'error', message: result.reason };
  }

  revalidateReservationLifecycleViews({ bookingCode });

  return {
    status: 'cancelled',
    bookingCode: result.bookingCode,
    refundPaise: result.refund.totalRefundPaise,
    tier: result.refund.tier,
    hoursBefore: result.refund.hoursBeforeCheckIn,
  };
}

export async function completeReserveBookingAction(bookingCode: string): Promise<void> {
  const session = await getCustomerSession();
  if (!session) {
    redirect(`/login?next=${encodeURIComponent(`/booking/${bookingCode}`)}`);
  }
  await requireCustomerOwnsBookingCode(session, bookingCode);

  const bookingRes = await getBookingByCode(bookingCode);
  if (!bookingRes.ok || !bookingRes.data) {
    throw new Error('Booking not found.');
  }
  const booking = bookingRes.data;
  if (booking.durationMode !== 'reserve' || booking.reserveStatus !== 'active') {
    throw new Error('This reservation is not ready for completion.');
  }
  if (!booking.reserveCode) {
    throw new Error('Reservation details are unavailable.');
  }

  const reserve = await db
    .select({ id: bedReserveHolds.id })
    .from(bedReserveHolds)
    .where(eq(bedReserveHolds.reserveCode, booking.reserveCode))
    .limit(1);
  const reserveId = reserve[0]?.id;
  if (!reserveId) {
    throw new Error('Reservation not found.');
  }

  const converted = await convertBedReserveToMonthlyStay(reserveId);
  if (!converted.ok) {
    throw new Error(converted.reason);
  }

  revalidateReservationLifecycleViews({ bookingCode });
  redirect(converted.monthlyDuePaise > 0 ? `/booking/${bookingCode}/pay` : `/booking/${bookingCode}`);
}
