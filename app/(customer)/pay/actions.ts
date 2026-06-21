'use server';

import { assertActivePaymentLink } from '@/src/lib/billing/paymentLinkAccess';
import { uploadPaymentScreenshot } from '@/src/lib/payments/screenshotUpload';
import { submitDepositLinkPaymentProof } from '@/src/services/residentCharges';
import { submitRentPaymentProof } from '@/src/services/rentInvoices';

export type PaymentLinkAuthError = { ok: false; status: 401 | 403 | 404; message: string };

export async function uploadPaymentLinkScreenshotAction(
  formData: FormData,
): Promise<string> {
  const linkId = String(formData.get('linkId') ?? '');
  if (!linkId) throw new Error('Missing payment link.');

  const access = await assertActivePaymentLink(linkId);
  if (!access.ok) {
    throw new Error(access.message);
  }

  const file = formData.get('file');
  if (!(file instanceof File)) throw new Error('No file provided.');
  return uploadPaymentScreenshot(file);
}

export async function submitPaymentLinkProofAction(
  linkId: string,
  paymentProofUrl: string,
): Promise<{ ok: true } | { ok: false; message: string; status?: 401 | 403 | 404 }> {
  const access = await assertActivePaymentLink(linkId);
  if (!access.ok) {
    return { ok: false, message: access.message, status: access.status };
  }
  const link = access.link;

  if (link.rentInvoiceId) {
    return submitRentPaymentProof(link.residentId, link.rentInvoiceId, paymentProofUrl);
  }

  if (link.purpose === 'deposit' && link.bookingId) {
    return submitDepositLinkPaymentProof(linkId, link.residentId, paymentProofUrl);
  }

  return { ok: false, message: 'This payment link does not accept proof uploads here.' };
}
