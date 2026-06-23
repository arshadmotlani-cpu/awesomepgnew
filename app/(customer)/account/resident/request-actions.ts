'use server';

import { revalidatePath } from 'next/cache';
import { getCustomerSession } from '@/src/lib/auth/session';
import { uploadPaymentScreenshot } from '@/src/lib/payments/screenshotUpload';
import { revalidateVacatingLifecycleForBooking } from '@/src/lib/vacating/revalidateVacatingViews';
import {
  submitDepositRefundRequest,
  submitStayExtensionRequest,
} from '@/src/services/residentRequests';

export type RequestActionState = { ok: boolean; error?: string };

export async function uploadDepositRefundMeterAction(formData: FormData): Promise<string> {
  const session = await getCustomerSession();
  if (!session) throw new Error('Sign in required.');

  const file = formData.get('file');
  if (!(file instanceof File)) throw new Error('No file provided.');
  const bookingId = formData.get('bookingId')?.toString() || null;
  return uploadPaymentScreenshot(file, {
    customerId: session.customerId,
    uploadType: 'meter_photo',
    bookingId,
  });
}

export async function uploadDepositRefundQrAction(formData: FormData): Promise<string> {
  const session = await getCustomerSession();
  if (!session) throw new Error('Sign in required.');

  const file = formData.get('file');
  if (!(file instanceof File)) throw new Error('No file provided.');
  const bookingId = formData.get('bookingId')?.toString() || null;
  return uploadPaymentScreenshot(file, {
    customerId: session.customerId,
    uploadType: 'refund_qr',
    bookingId,
  });
}

export async function submitDepositRefundRequestAction(
  _prev: RequestActionState,
  formData: FormData,
): Promise<RequestActionState> {
  const session = await getCustomerSession();
  if (!session) return { ok: false, error: 'Sign in required.' };

  const bookingId = formData.get('bookingId')?.toString() ?? '';
  const notes = formData.get('notes')?.toString()?.trim();
  const meterReadingPhotoUrl = formData.get('meterReadingPhotoUrl')?.toString()?.trim() || null;
  const payoutQrUrl = formData.get('payoutQrUrl')?.toString()?.trim() || null;
  const payoutUpiId = formData.get('payoutUpiId')?.toString()?.trim() || null;
  const useAverageBillingFallback = formData.get('useAverageBillingFallback')?.toString() === '1';

  const { getCheckoutSettlementForCustomer, submitResidentCheckoutDetails } = await import(
    '@/src/services/checkoutSettlement'
  );
  const checkout = await getCheckoutSettlementForCustomer(session.customerId, bookingId);
  if (checkout) {
    const checkoutResult = await submitResidentCheckoutDetails({
      settlementId: checkout.id,
      customerId: session.customerId,
      electricityMeterPhotoUrl: meterReadingPhotoUrl,
      electricityUseAverage: useAverageBillingFallback,
      payoutUpiId,
      payoutQrUrl,
    });
    if (!checkoutResult.ok) return { ok: false, error: checkoutResult.error };
    revalidatePath('/account/profile');
    revalidatePath('/account/resident');
    await revalidateVacatingLifecycleForBooking(bookingId, session.customerId);
    return { ok: true };
  }

  const result = await submitDepositRefundRequest({
    customerId: session.customerId,
    bookingId,
    notes: notes || undefined,
    meterReadingPhotoUrl,
    useAverageBillingFallback,
    payoutUpiId,
    payoutQrUrl,
  });

  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath('/account/profile');
  revalidatePath('/account/resident');
  await revalidateVacatingLifecycleForBooking(bookingId, session.customerId);
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
