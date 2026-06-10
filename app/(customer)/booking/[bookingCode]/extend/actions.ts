'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getCustomerSession } from '@/src/lib/auth/session';
import { requireCustomerOwnsBookingCode } from '@/src/lib/auth/guards';
import {
  requestExtension,
  type ExtensionConflict,
} from '@/src/services/extension';

export type ExtendActionState =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | { status: 'conflict'; message: string; conflicts: ExtensionConflict[] };

/** Customer-driven extension request — requires a signed-in session that owns the booking. */
export async function requestExtensionAction(
  _prev: ExtendActionState,
  formData: FormData,
): Promise<ExtendActionState> {
  const session = await getCustomerSession();
  if (!session) {
    return { status: 'error', message: 'Sign in to request an extension.' };
  }

  const bookingCode = String(formData.get('bookingCode') ?? '');
  if (!/^APG-\d{4}-\d+$/.test(bookingCode)) {
    return { status: 'error', message: 'Invalid booking code.' };
  }
  try {
    await requireCustomerOwnsBookingCode(session, bookingCode);
  } catch {
    return { status: 'error', message: 'Booking not found or access denied.' };
  }

  const newUntilDate = String(formData.get('newUntilDate') ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(newUntilDate)) {
    return { status: 'error', message: 'Pick a new check-out date.' };
  }
  const durationMode = String(formData.get('durationMode') ?? '');
  if (!['daily', 'weekly', 'monthly'].includes(durationMode)) {
    return { status: 'error', message: 'Select a duration mode.' };
  }

  const result = await requestExtension({
    bookingCode,
    newUntilDate,
    durationMode: durationMode as 'daily' | 'weekly' | 'monthly',
    requestedBy: 'customer',
    actor: { kind: 'customer', customerId: session.customerId },
    customerPhone: session.phone,
  });

  if (!result.ok) {
    if (result.kind === 'conflict') {
      return {
        status: 'conflict',
        message: result.message,
        conflicts: result.conflicts,
      };
    }
    return { status: 'error', message: result.message };
  }

  revalidatePath('/admin');
  revalidatePath('/admin/bookings');
  revalidatePath('/admin/extensions');
  revalidatePath(`/booking/${bookingCode}`);
  revalidatePath('/account/bookings');
  redirect(`/booking/${bookingCode}/extend/${result.extensionId}/pay`);
}
