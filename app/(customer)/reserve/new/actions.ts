'use server';

import { redirect } from 'next/navigation';
import { requireCustomerSession } from '@/src/lib/auth/guards';
import { createBedReserve } from '@/src/services/bedReserve';
import { getCustomerById } from '@/src/services/profile';

export type ReserveActionState =
  | { status: 'idle' }
  | { status: 'error'; message: string };

export async function createBedReserveAction(
  _prev: ReserveActionState,
  formData: FormData,
): Promise<ReserveActionState> {
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

  try {
    const result = await createBedReserve({
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
    redirect(`/booking/${result.bookingCode}/pay`);
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : 'Could not create reserve.',
    };
  }
}
