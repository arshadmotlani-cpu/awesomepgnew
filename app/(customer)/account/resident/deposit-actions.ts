'use server';

import { revalidatePath } from 'next/cache';
import { getCustomerSession } from '@/src/lib/auth/session';
import { submitDepositDueExtensionRequest } from '@/src/services/residentRequests';

export async function submitDepositDueExtensionRequestAction(formData: FormData) {
  const session = await getCustomerSession();
  if (!session) {
    return { ok: false as const, error: 'Sign in required.' };
  }
  const bookingId = String(formData.get('bookingId') ?? '');
  const requestedDueDate = String(formData.get('requestedDueDate') ?? '');
  const notes = String(formData.get('notes') ?? '').trim() || undefined;

  const result = await submitDepositDueExtensionRequest({
    customerId: session.customerId,
    bookingId,
    requestedDueDate,
    notes,
  });

  if (!result.ok) {
    return { ok: false as const, error: result.error };
  }

  revalidatePath('/account/profile');
  return { ok: true as const };
}
