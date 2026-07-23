'use server';

import { revalidatePath } from 'next/cache';
import { getCustomerSession } from '@/src/lib/auth/session';
import { revalidateVacatingLifecycleForBooking } from '@/src/lib/vacating/revalidateVacatingViews';
import {
  cancelApprovedVacatingByCustomer,
} from '@/src/services/vacating';
import {
  previewVacatingDateChange,
  submitVacatingDateChangeRequest,
  cancelVacatingDateChangeRequest,
  type VacatingDateChangePreview,
} from '@/src/services/vacatingDateChange';

export type VacatingDateChangeActionState =
  | { ok: true; preview?: VacatingDateChangePreview }
  | { ok: false; error: string };

export async function previewVacatingDateChangeAction(
  bookingId: string,
  requestedVacatingDate: string,
): Promise<VacatingDateChangeActionState> {
  const session = await getCustomerSession();
  if (!session) return { ok: false, error: 'Sign in required.' };

  const result = await previewVacatingDateChange({
    bookingId,
    customerId: session.customerId,
    requestedVacatingDate,
  });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, preview: result.preview };
}

export async function submitVacatingDateChangeAction(
  bookingId: string,
  requestedVacatingDate: string,
  residentNotes?: string,
): Promise<VacatingDateChangeActionState> {
  const session = await getCustomerSession();
  if (!session) return { ok: false, error: 'Sign in required.' };

  const result = await submitVacatingDateChangeRequest({
    bookingId,
    customerId: session.customerId,
    requestedVacatingDate,
    residentNotes,
  });
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath('/account/profile');
  await revalidateVacatingLifecycleForBooking(bookingId, session.customerId);
  return { ok: true };
}

export async function cancelVacatingDateChangeRequestAction(
  requestId: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await getCustomerSession();
  if (!session) return { ok: false, error: 'Sign in required.' };

  const result = await cancelVacatingDateChangeRequest({
    requestId,
    customerId: session.customerId,
  });
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath('/account/profile');
  return { ok: true };
}

export async function cancelApprovedVacatingAction(
  requestId: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await getCustomerSession();
  if (!session) return { ok: false, error: 'Sign in required.' };

  const result = await cancelApprovedVacatingByCustomer({
    requestId,
    customerId: session.customerId,
  });
  if (!result.ok) {
    const message =
      result.kind === 'cannot_restore'
        ? result.message
        : result.kind === 'wrong_status'
          ? 'This move-out can no longer be cancelled.'
          : 'Could not cancel move-out.';
    return { ok: false, error: message };
  }

  revalidatePath('/account/profile');
  await revalidateVacatingLifecycleForBooking(result.bookingId, session.customerId);
  return { ok: true };
}
