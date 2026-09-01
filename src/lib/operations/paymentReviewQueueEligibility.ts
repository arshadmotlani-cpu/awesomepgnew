/**
 * Operations "waiting for approval" SSOT — one definition for queue reads.
 *
 * An item is awaiting admin review only while:
 * - invoice/proof entity is in an awaiting status with txn or screenshot proof, AND
 * - no succeeded settlement payment already exists for that proof approval.
 */

import { sql } from 'drizzle-orm';
import {
  electricityInvoices,
  paymentLinks,
  paymentProofRejections,
  payments,
  pgPaymentRecords,
  rentInvoices,
  stayExtensions,
} from '@/src/db/schema';
import type { PaymentReviewKind } from '@/src/lib/payments/paymentReviewInvariants';
import { hasTxnOrScreenshotProof } from '@/src/services/pgTransactionRefIndex';

export const INVOICE_AWAITING_PAYMENT_REVIEW_STATUSES = [
  'pending',
  'overdue',
  'payment_in_progress',
] as const;

export type InvoiceAwaitingPaymentReviewStatus =
  (typeof INVOICE_AWAITING_PAYMENT_REVIEW_STATUSES)[number];

/** Succeeded payment row created by admin proof approval for each review kind. */
export function proofApprovalProviderPaymentId(
  kind: Exclude<PaymentReviewKind, 'qr'>,
  entityId: string,
): string {
  switch (kind) {
    case 'rent':
      return `rent-proof-${entityId}`;
    case 'electricity':
      return `qr-proof-${entityId}`;
    case 'extension':
      return `extension-proof-${entityId}`;
    case 'deposit_link':
      return `deposit-link-proof-${entityId}`;
  }
}

export function depositLinkInvoiceProofProviderPaymentId(linkId: string): string {
  return `invoice-link-proof-${linkId}`;
}

export function allDepositLinkProofProviderPaymentIds(linkId: string): string[] {
  return [
    proofApprovalProviderPaymentId('deposit_link', linkId),
    depositLinkInvoiceProofProviderPaymentId(linkId),
  ];
}

export function isInvoiceStatusAwaitingPaymentReview(
  status: string | null | undefined,
): status is InvoiceAwaitingPaymentReviewStatus {
  if (!status) return false;
  return (INVOICE_AWAITING_PAYMENT_REVIEW_STATUSES as readonly string[]).includes(status);
}

export function isRentInvoiceAwaitingPaymentReview(input: {
  status: string | null | undefined;
  paymentProofUrl?: string | null;
  paymentProofTransactionRef?: string | null;
  hasSucceededProofPayment?: boolean;
  hasActiveRejection?: boolean;
}): boolean {
  if (input.hasActiveRejection) return false;
  if (!isInvoiceStatusAwaitingPaymentReview(input.status)) return false;
  if (
    !hasTxnOrScreenshotProof({
      paymentProofUrl: input.paymentProofUrl,
      transactionRef: input.paymentProofTransactionRef,
    })
  ) {
    return false;
  }
  if (input.hasSucceededProofPayment) return false;
  return true;
}

/** Exclude rent invoices whose proof was already settled (prevents post-approval queue ghosts). */
export function rentInvoiceWithoutSucceededProofPaymentSql() {
  return sql`NOT EXISTS (
    SELECT 1 FROM ${payments} p
    WHERE p.status = 'succeeded'
      AND p.provider_payment_id = 'rent-proof-' || ${rentInvoices.id}::text
  )`;
}

export function electricityInvoiceWithoutSucceededProofPaymentSql() {
  return sql`NOT EXISTS (
    SELECT 1 FROM ${payments} p
    WHERE p.status = 'succeeded'
      AND p.provider_payment_id = 'qr-proof-' || ${electricityInvoices.id}::text
  )`;
}

export function extensionWithoutSucceededProofPaymentSql() {
  return sql`NOT EXISTS (
    SELECT 1 FROM ${payments} p
    WHERE p.status = 'succeeded'
      AND p.provider_payment_id = 'extension-proof-' || ${stayExtensions.id}::text
  )`;
}

export function depositLinkWithoutSucceededProofPaymentSql() {
  return sql`NOT EXISTS (
    SELECT 1 FROM ${payments} p
    WHERE p.status = 'succeeded'
      AND (
        p.provider_payment_id = 'deposit-link-proof-' || ${paymentLinks.id}::text
        OR p.provider_payment_id = 'invoice-link-proof-' || ${paymentLinks.id}::text
      )
  )`;
}

function activeRejectionNotExistsSql(
  entityType: 'rent_invoice' | 'electricity_invoice' | 'payment_link' | 'stay_extension' | 'pg_payment_record',
  entityIdColumn: unknown,
) {
  return sql`NOT EXISTS (
    SELECT 1 FROM ${paymentProofRejections} ppr
    WHERE ppr.entity_type = ${entityType}
      AND ppr.entity_id = ${entityIdColumn}
      AND ppr.status = 'active'
  )`;
}

/** Rejected proof must not remain actionable in Operations. */
export function rentInvoiceWithoutActiveRejectionSql() {
  return activeRejectionNotExistsSql('rent_invoice', rentInvoices.id);
}

export function electricityInvoiceWithoutActiveRejectionSql() {
  return activeRejectionNotExistsSql('electricity_invoice', electricityInvoices.id);
}

export function depositLinkWithoutActiveRejectionSql() {
  return activeRejectionNotExistsSql('payment_link', paymentLinks.id);
}

export function extensionWithoutActiveRejectionSql() {
  return activeRejectionNotExistsSql('stay_extension', stayExtensions.id);
}

export function pgPaymentRecordWithoutActiveRejectionSql() {
  return activeRejectionNotExistsSql('pg_payment_record', pgPaymentRecords.id);
}

/** Rent invoice has proof on file but settlement payment already succeeded — heal, do not queue. */
export const staleRentInvoicePaymentReviewSql = sql`
  ${rentInvoices.status} IN ('pending', 'overdue', 'payment_in_progress')
  AND (
    (${rentInvoices.paymentProofUrl} IS NOT NULL AND trim(${rentInvoices.paymentProofUrl}) <> '')
    OR (${rentInvoices.paymentProofTransactionRef} IS NOT NULL AND trim(${rentInvoices.paymentProofTransactionRef}) <> '')
  )
  AND EXISTS (
    SELECT 1 FROM ${payments} p
    WHERE p.status = 'succeeded'
      AND p.provider_payment_id = 'rent-proof-' || ${rentInvoices.id}::text
  )
`;

export const staleElectricityInvoicePaymentReviewSql = sql`
  ${electricityInvoices.status} = 'pending'
  AND (
    (${electricityInvoices.paymentProofUrl} IS NOT NULL AND trim(${electricityInvoices.paymentProofUrl}) <> '')
    OR (${electricityInvoices.paymentProofTransactionRef} IS NOT NULL AND trim(${electricityInvoices.paymentProofTransactionRef}) <> '')
  )
  AND EXISTS (
    SELECT 1 FROM ${payments} p
    WHERE p.status = 'succeeded'
      AND p.provider_payment_id = 'qr-proof-' || ${electricityInvoices.id}::text
  )
`;
