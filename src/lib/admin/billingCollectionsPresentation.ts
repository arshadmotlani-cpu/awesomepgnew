import type { AdminRentInvoiceRow, AdminPaidElectricityCollectionRow } from '@/src/db/queries/admin';
import {
  sortBillingCollections,
  type BillingRecentCollectionRow,
} from '@/src/lib/admin/billingCollectionsFilter';
import { titleCase } from '@/src/lib/format';

export type { BillingRecentCollectionRow, BillingCollectionDateFilter } from '@/src/lib/admin/billingCollectionsFilter';
export {
  BILLING_COLLECTION_DATE_FILTERS,
  filterBillingCollectionsByDate,
  sortBillingCollections,
} from '@/src/lib/admin/billingCollectionsFilter';

function formatPaymentModeLabel(provider: string | null | undefined): string | null {
  if (!provider) return null;
  if (provider === 'cash') return 'Cash';
  if (provider === 'upi_manual' || provider === 'razorpay' || provider === 'stripe') return 'UPI';
  if (provider === 'bank_transfer') return 'Bank transfer';
  if (provider === 'mock') return 'Other';
  return titleCase(provider.replace(/_/g, ' '));
}

function collectedByFromPaymentPayload(rawPayload: unknown): string | null {
  if (!rawPayload || typeof rawPayload !== 'object') return null;
  const payload = rawPayload as Record<string, unknown>;
  if (payload.source !== 'admin_cash_settlement') return null;
  const name = payload.receivedByAdminName;
  if (typeof name === 'string' && name.trim()) return name.trim();
  return null;
}

export function resolvePaymentCollectedBy(
  provider: string | null | undefined,
  rawPayload: unknown,
): string {
  const fromPayload = collectedByFromPaymentPayload(rawPayload);
  if (fromPayload) return fromPayload;
  if (provider === 'cash') return 'Admin';
  if (provider) return 'Payment gateway';
  return '—';
}

export function rentInvoiceToCollectionRow(row: AdminRentInvoiceRow): BillingRecentCollectionRow {
  const amount =
    row.paidPrincipalPaise + row.paidLateFeePaise > 0
      ? row.paidPrincipalPaise + row.paidLateFeePaise
      : (row.outstandingPaise ?? row.rentPaise);
  return {
    id: `rent-${row.id}`,
    kind: 'rent',
    customerId: row.customerId,
    customerFullName: row.customerFullName,
    customerPhone: row.customerPhone,
    pgName: row.pgName,
    roomNumber: row.roomNumber,
    bedCode: row.bedCode,
    amountPaise: amount,
    paidAt: row.paidAt,
    paymentMode: formatPaymentModeLabel(row.paymentProvider),
    collectedBy: resolvePaymentCollectedBy(row.paymentProvider, row.paymentRawPayload),
    invoiceNumber: row.invoiceNumber,
    billingMonth: row.billingMonth,
    paymentStatus: titleCase((row.effectiveStatus ?? row.status).replace(/_/g, ' ')),
  };
}

export function electricityInvoiceToCollectionRow(
  row: AdminPaidElectricityCollectionRow,
): BillingRecentCollectionRow {
  return {
    id: `elec-${row.id}`,
    kind: 'electricity',
    customerId: row.customerId,
    customerFullName: row.customerFullName,
    customerPhone: row.customerPhone,
    pgName: row.pgName,
    roomNumber: row.roomNumber,
    bedCode: row.bedCode,
    amountPaise: row.amountPaise,
    paidAt: row.paidAt,
    paymentMode: formatPaymentModeLabel(row.paymentProvider),
    collectedBy: resolvePaymentCollectedBy(row.paymentProvider, row.paymentRawPayload),
    invoiceNumber: row.invoiceNumber,
    billingMonth: row.billingMonth,
    paymentStatus: titleCase(row.effectiveStatus.replace(/_/g, ' ')),
  };
}

export function mergeBillingRecentCollections(
  rentRows: AdminRentInvoiceRow[],
  electricityRows: AdminPaidElectricityCollectionRow[],
): BillingRecentCollectionRow[] {
  return sortBillingCollections([
    ...rentRows.map(rentInvoiceToCollectionRow),
    ...electricityRows.map(electricityInvoiceToCollectionRow),
  ]);
}
