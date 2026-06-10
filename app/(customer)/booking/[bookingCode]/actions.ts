'use server';

import { revalidatePath } from 'next/cache';
import { cancelBooking } from '@/src/services/bookingLifecycle';
import { getCustomerSession } from '@/src/lib/auth/session';
import { requireCustomerOwnsBookingCode } from '@/src/lib/auth/guards';

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

  revalidatePath('/admin');
  revalidatePath('/admin/bookings');
  revalidatePath('/admin/payments');
  revalidatePath(`/booking/${bookingCode}`);
  revalidatePath('/account/bookings');

  return {
    status: 'cancelled',
    bookingCode: result.bookingCode,
    refundPaise: result.refund.totalRefundPaise,
    tier: result.refund.tier,
    hoursBefore: result.refund.hoursBeforeCheckIn,
  };
}
