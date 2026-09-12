/**
 * Canonical rent invoice projection input — single builder for all admin/list surfaces.
 * Every caller of projectInvoice / projectRentInvoiceAdminView must use this helper
 * so lateFeeBasePaise and proof fields are never dropped.
 */
import type { RentInvoice } from '@/src/db/schema/rentInvoices';

export type RentInvoiceProjectInput = Parameters<
  typeof import('@/src/services/rentInvoices').projectInvoice
>[0];

/** DB rent_invoices row (full or partial select with required fields). */
export type RentInvoiceDbProjectionFields = Pick<
  RentInvoice,
  | 'id'
  | 'invoiceNumber'
  | 'bookingId'
  | 'customerId'
  | 'bedId'
  | 'pgId'
  | 'billingMonth'
  | 'dueDate'
  | 'rentPaise'
  | 'lateFeeBasePaise'
  | 'discountPaise'
  | 'paidPrincipalPaise'
  | 'paidLateFeePaise'
  | 'lateFeeLockedPaise'
  | 'status'
  | 'paidAt'
  | 'paymentId'
  | 'paymentProofUrl'
  | 'proofSubmittedAt'
  | 'proofSnapshotOutstandingPaise'
  | 'proofSnapshotLateFeePaise'
  | 'proofSnapshotPrincipalDuePaise'
  | 'notes'
  | 'cancelledAt'
  | 'cancellationReason'
  | 'isAdhoc'
  | 'invoiceSubtype'
  | 'createdAt'
  | 'updatedAt'
>;

export function buildRentInvoiceProjectInput(
  row: RentInvoiceDbProjectionFields,
): RentInvoiceProjectInput {
  return {
    id: row.id,
    invoiceNumber: row.invoiceNumber,
    bookingId: row.bookingId,
    customerId: row.customerId,
    bedId: row.bedId,
    pgId: row.pgId,
    billingMonth: row.billingMonth,
    dueDate: row.dueDate,
    rentPaise: row.rentPaise,
    lateFeeBasePaise: row.lateFeeBasePaise ?? 0,
    discountPaise: row.discountPaise ?? 0,
    paidPrincipalPaise: row.paidPrincipalPaise ?? 0,
    paidLateFeePaise: row.paidLateFeePaise ?? 0,
    lateFeeLockedPaise: row.lateFeeLockedPaise ?? null,
    status: row.status,
    paidAt: row.paidAt ?? null,
    paymentId: row.paymentId ?? null,
    paymentProofUrl: row.paymentProofUrl ?? null,
    proofSubmittedAt: row.proofSubmittedAt ?? null,
    proofSnapshotOutstandingPaise: row.proofSnapshotOutstandingPaise ?? null,
    proofSnapshotLateFeePaise: row.proofSnapshotLateFeePaise ?? null,
    proofSnapshotPrincipalDuePaise: row.proofSnapshotPrincipalDuePaise ?? null,
    notes: row.notes ?? null,
    cancelledAt: row.cancelledAt ?? null,
    cancellationReason: row.cancellationReason ?? null,
    isAdhoc: row.isAdhoc ?? false,
    invoiceSubtype: row.invoiceSubtype ?? 'standard',
    createdAt: row.createdAt,
    updatedAt: row.updatedAt ?? row.createdAt,
  };
}
