'use server';

import { eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { paymentLinks } from '@/src/db/schema';
import { getCustomerSession } from '@/src/lib/auth/session';
import { uploadPaymentScreenshot } from '@/src/lib/payments/screenshotUpload';
import { submitDepositLinkPaymentProof } from '@/src/services/residentCharges';
import { submitRentPaymentProof } from '@/src/services/rentInvoices';

export type PaymentLinkAuthError = { ok: false; status: 401 | 403; message: string };

async function assertPaymentLinkResidentAccess(
  linkId: string,
): Promise<
  | { ok: true; link: typeof paymentLinks.$inferSelect }
  | PaymentLinkAuthError
> {
  const session = await getCustomerSession();
  if (!session) {
    return { ok: false, status: 401, message: 'Sign in required.' };
  }

  const [link] = await db
    .select()
    .from(paymentLinks)
    .where(eq(paymentLinks.id, linkId))
    .limit(1);
  if (!link || link.status !== 'active') {
    return { ok: false, status: 403, message: 'Payment link not found or expired.' };
  }
  if (link.residentId !== session.customerId) {
    return { ok: false, status: 403, message: 'This payment link belongs to another resident.' };
  }

  return { ok: true, link };
}

export async function uploadPaymentLinkScreenshotAction(
  formData: FormData,
): Promise<string> {
  const linkId = String(formData.get('linkId') ?? '');
  if (!linkId) throw new Error('Missing payment link.');

  const access = await assertPaymentLinkResidentAccess(linkId);
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
): Promise<{ ok: true } | { ok: false; message: string; status?: 401 | 403 }> {
  const access = await assertPaymentLinkResidentAccess(linkId);
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
