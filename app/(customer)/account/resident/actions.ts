'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getCustomerSession } from '@/src/lib/auth/session';
import { requireCustomerOwnsBooking } from '@/src/lib/auth/guards';
import { submitVacatingRequest, cancelVacatingRequestByCustomer } from '@/src/services/vacating';
import { accountProfileHref } from '@/src/lib/accountNavigation';
import { revalidateVacatingLifecycleForBooking } from '@/src/lib/vacating/revalidateVacatingViews';

export type VacatingActionState =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | { status: 'submitted' };

async function verifySessionOwnership(bookingId: string): Promise<
  | { ok: true; customer: { id: string } }
  | { ok: false; message: string }
> {
  const session = await getCustomerSession();
  if (!session) return { ok: false, message: 'Sign in required.' };
  try {
    await requireCustomerOwnsBooking(session, bookingId);
    return { ok: true, customer: { id: session.customerId } };
  } catch {
    return { ok: false, message: 'Access denied.' };
  }
}

export async function submitVacatingAction(
  _prev: VacatingActionState,
  formData: FormData,
): Promise<VacatingActionState> {
  const bookingId = String(formData.get('bookingId') ?? '');
  const vacatingDate = String(formData.get('vacatingDate') ?? '');
  const notes = String(formData.get('notes') ?? '').trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(vacatingDate)) {
    return { status: 'error', message: 'Vacating date must be YYYY-MM-DD.' };
  }

  const ownership = await verifySessionOwnership(bookingId);
  if (!ownership.ok) return { status: 'error', message: ownership.message };

  const result = await submitVacatingRequest({
    bookingId,
    vacatingDate,
    notes: notes || null,
  });
  if (!result.ok) {
    if (result.kind === 'already_exists') {
      return {
        status: 'error',
        message:
          'A vacating request is already on file for this booking. Open your resident area to withdraw it if you submitted by mistake.',
      };
    }
    if (result.kind === 'invalid_input') {
      return { status: 'error', message: result.message };
    }
    return {
      status: 'error',
      message: `Could not submit (${result.kind}).`,
    };
  }
  revalidatePath('/account/profile');
  revalidatePath('/account/resident');
  revalidatePath('/account/bookings');
  await revalidateVacatingLifecycleForBooking(bookingId, ownership.customer.id);
  redirect(accountProfileHref('resident', { tab: 'vacating' }));
}

export type CancelVacatingActionState =
  | { status: 'idle' }
  | { status: 'error'; message: string };

export async function cancelVacatingAction(
  _prev: CancelVacatingActionState,
  formData: FormData,
): Promise<CancelVacatingActionState> {
  const requestId = String(formData.get('requestId') ?? '');
  const bookingId = String(formData.get('bookingId') ?? '');

  if (!requestId || !bookingId) {
    return { status: 'error', message: 'Missing request details.' };
  }

  const ownership = await verifySessionOwnership(bookingId);
  if (!ownership.ok) return { status: 'error', message: ownership.message };

  const result = await cancelVacatingRequestByCustomer({
    requestId,
    customerId: ownership.customer.id,
  });
  if (!result.ok) {
    if (result.kind === 'forbidden') {
      return { status: 'error', message: 'Access denied.' };
    }
    if (result.kind === 'wrong_status') {
      return {
        status: 'error',
        message:
          result.status === 'approved'
            ? 'Admin already approved this request — contact your PG manager to change plans.'
            : 'This vacating request can no longer be withdrawn.',
      };
    }
    return { status: 'error', message: 'Vacating request not found.' };
  }

  revalidatePath('/account/profile');
  await revalidateVacatingLifecycleForBooking(bookingId, ownership.customer.id);
  redirect(accountProfileHref('resident', { tab: 'vacating' }));
}
