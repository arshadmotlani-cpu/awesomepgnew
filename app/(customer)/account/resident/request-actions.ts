'use server';

import { revalidatePath } from 'next/cache';
import { getCustomerSession } from '@/src/lib/auth/session';
import {
  submitDepositRefundRequest,
  submitStayExtensionRequest,
} from '@/src/services/residentRequests';

export type RequestActionState = { ok: boolean; error?: string };

export async function submitDepositRefundRequestAction(
  _prev: RequestActionState,
  formData: FormData,
): Promise<RequestActionState> {
  const session = await getCustomerSession();
  if (!session) return { ok: false, error: 'Sign in required.' };

  const bookingId = formData.get('bookingId')?.toString() ?? '';
  const notes = formData.get('notes')?.toString()?.trim();

  const result = await submitDepositRefundRequest({
    customerId: session.customerId,
    bookingId,
    notes: notes || undefined,
  });

  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath('/account/profile');
  revalidatePath('/account/resident');
  return { ok: true };
}

export async function submitStayExtensionRequestAction(
  _prev: RequestActionState,
  formData: FormData,
): Promise<RequestActionState> {
  const session = await getCustomerSession();
  if (!session) return { ok: false, error: 'Sign in required.' };

  const bookingId = formData.get('bookingId')?.toString() ?? '';
  const requestedEndDate = formData.get('requestedEndDate')?.toString() ?? '';
  const notes = formData.get('notes')?.toString()?.trim();

  const result = await submitStayExtensionRequest({
    customerId: session.customerId,
    bookingId,
    requestedEndDate,
    notes: notes || undefined,
  });

  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath('/account/profile');
  revalidatePath('/account/resident');
  return { ok: true };
}
