'use server';

import { eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { paymentLinks } from '@/src/db/schema';
import { uploadPaymentScreenshot } from '@/src/lib/payments/screenshotUpload';
import { submitDepositLinkPaymentProof } from '@/src/services/residentCharges';
import { submitRentPaymentProof } from '@/src/services/rentInvoices';

export async function uploadPaymentLinkScreenshotAction(formData: FormData): Promise<string> {
  const linkId = String(formData.get('linkId') ?? '');
  if (!linkId) throw new Error('Missing payment link.');

  const [link] = await db
    .select({ id: paymentLinks.id, status: paymentLinks.status })
    .from(paymentLinks)
    .where(eq(paymentLinks.id, linkId))
    .limit(1);
  if (!link || link.status !== 'active') {
    throw new Error('Payment link not found or expired.');
  }

  const file = formData.get('file');
  if (!(file instanceof File)) throw new Error('No file provided.');
  return uploadPaymentScreenshot(file);
}

export async function submitPaymentLinkProofAction(
  linkId: string,
  paymentProofUrl: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const [link] = await db
    .select()
    .from(paymentLinks)
    .where(eq(paymentLinks.id, linkId))
    .limit(1);
  if (!link || link.status !== 'active') {
    return { ok: false, message: 'Payment link not found or expired.' };
  }

  if (link.rentInvoiceId) {
    return submitRentPaymentProof(link.residentId, link.rentInvoiceId, paymentProofUrl);
  }

  if (link.purpose === 'deposit' && link.bookingId) {
    return submitDepositLinkPaymentProof(linkId, paymentProofUrl);
  }

  return { ok: false, message: 'This payment link does not accept proof uploads here.' };
}
