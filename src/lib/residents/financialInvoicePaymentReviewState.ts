/**
 * Resident-facing payment review state for financial_invoices paid via payment_links.
 * Must match rent/electricity pending-proof semantics in residentPortalBillRows.
 */
import { hasTxnOrScreenshotProof } from '@/src/services/pgTransactionRefIndex';

export type PaymentLinkProofSnapshot = {
  status: string;
  paymentProofUrl: string | null;
  paymentProofTransactionRef: string | null;
};

export function isActivePaymentLinkAwaitingAdminReview(
  link: PaymentLinkProofSnapshot | null | undefined,
): boolean {
  if (!link || link.status !== 'active') return false;
  return hasTxnOrScreenshotProof({
    paymentProofUrl: link.paymentProofUrl,
    transactionRef: link.paymentProofTransactionRef,
  });
}

/** Outstanding is still owed, but resident has submitted proof — show pending verification, not "unpaid". */
export function isFinancialInvoiceAwaitingPaymentLinkReview(input: {
  invoiceStatus: string;
  outstandingPaise: number;
  paymentLink: PaymentLinkProofSnapshot | null | undefined;
}): boolean {
  if (input.outstandingPaise <= 0) return false;
  if (input.invoiceStatus === 'paid' || input.invoiceStatus === 'cancelled') return false;
  return isActivePaymentLinkAwaitingAdminReview(input.paymentLink);
}

export const FINANCIAL_INVOICE_PENDING_REVIEW_STATUS = 'Payment verification pending';
