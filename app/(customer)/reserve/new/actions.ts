'use server';

import { revalidateReservationLifecycleViews } from '@/src/lib/occupancyRevalidate';
import { redirect } from 'next/navigation';
import { requireCustomerSession } from '@/src/lib/auth/guards';
import {
  cancelBedReserveDraftByCustomer,
  createBedReserve,
} from '@/src/services/bedReserve';
import { getCustomerById } from '@/src/services/profile';

export type ReserveActionState =
  | { status: 'idle' }
  | { status: 'error'; message: string };

export async function cancelBedReserveDraftAction(bookingId: string): Promise<void> {
  const session = await requireCustomerSession('/account/bookings');
  await cancelBedReserveDraftByCustomer(bookingId, session.customerId);
  revalidateReservationLifecycleViews();
  redirect('/pgs');
}

export async function createBedReserveAction(
  _prev: ReserveActionState,
  formData: FormData,
): Promise<ReserveActionState> {
  console.info('[reserve-pay][STEP A1] create reserve action start');
  const session = await requireCustomerSession('/account/bookings');
  const customer = await getCustomerById(session.customerId);
  if (!customer) {
    return { status: 'error', message: 'Account not found.' };
  }

  const bedId = String(formData.get('bedId') ?? '').trim();
  const reserveStart = String(formData.get('reserveStart') ?? '').trim();
  const checkInDate = String(formData.get('checkInDate') ?? '').trim();

  if (!bedId || !reserveStart || !checkInDate) {
    return { status: 'error', message: 'Missing reserve details.' };
  }

  let result;
  try {
    console.info('[reserve-pay][STEP A2] creating reserve draft', {
      customerId: session.customerId,
      bedId,
      reserveStart,
      checkInDate,
    });
    result = await createBedReserve({
      bedId,
      customerId: session.customerId,
      reserveStart,
      checkInDate,
      customer: {
        fullName: customer.fullName,
        email: customer.email,
        phone: customer.phone,
        gender: customer.gender,
      },
    });
  } catch (err) {
    console.error('[reserve-pay][STEP A2_FAIL] reserve draft create failed', err);
    return {
      status: 'error',
      message: err instanceof Error ? err.message : 'Could not create reserve.',
    };
  }

  console.info('[reserve-pay][STEP A3] reserve draft created, redirecting', {
    bookingCode: result.bookingCode,
  });
  redirect(`/booking/${result.bookingCode}/pay`);
}
