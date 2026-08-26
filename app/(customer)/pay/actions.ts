'use server';

import { assertActivePaymentLink } from '@/src/lib/billing/paymentLinkAccess';
import {
  submitDepositLinkPaymentProof,
  submitInvoiceLinkPaymentProof,
} from '@/src/services/residentCharges';
import { submitRentPaymentProof } from '@/src/services/rentInvoices';

export type PaymentLinkAuthError = { ok: false; status: 401 | 403 | 404; message: string };

export async function submitPaymentLinkProofAction(
  linkId: string,
  proof: { transactionRef: string; paymentProofUrl?: string | null },
): Promise<{ ok: true } | { ok: false; message: string; status?: 401 | 403 | 404 }> {
  const access = await assertActivePaymentLink(linkId);
  if (!access.ok) {
    return { ok: false, message: access.message, status: access.status };
  }
  const link = access.link;

  if (link.rentInvoiceId) {
    return submitRentPaymentProof(link.residentId, link.rentInvoiceId, proof);
  }

  if (link.invoiceId) {
    return submitInvoiceLinkPaymentProof(linkId, link.residentId, proof);
  }

  if (link.purpose === 'deposit' && link.bookingId) {
    return submitDepositLinkPaymentProof(linkId, link.residentId, proof);
  }

  return { ok: false, message: 'This payment link does not accept proof uploads here.' };
}
