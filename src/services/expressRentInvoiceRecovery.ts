/**
 * Express Booking rent-invoice recovery — avoid cancelled tombstones blocking retries.
 */

import { and, eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { financialInvoices, rentInvoices } from '@/src/db/schema';

export function isExpressRollbackCancellationReason(
  reason: string | null | undefined,
): boolean {
  if (!reason?.trim()) return false;
  return (
    reason.includes('Express walk-in rolled back') ||
    reason.includes('[rollback]') ||
    reason.includes('[system]') ||
    /rolled back/i.test(reason)
  );
}

/** Unpaid = no recorded payment on the rent invoice row. */
export function isUnpaidRentInvoice(row: {
  paidPrincipalPaise?: number | null;
  paymentId?: string | null;
}): boolean {
  return (row.paidPrincipalPaise ?? 0) === 0 && !row.paymentId;
}

/**
 * Express rollback tombstones block UNIQUE(booking_id, billing_month).
 * Must purge even when payment was recorded before finalize failed — rollback leaves
 * status=cancelled with paymentId/paidPrincipalPaise still set.
 */
export function shouldPurgeCancelledRentInvoiceForRetry(row: {
  status: string;
  paidPrincipalPaise?: number | null;
  paymentId?: string | null;
  cancellationReason?: string | null;
}): boolean {
  if (row.status !== 'cancelled') return false;
  return isExpressRollbackCancellationReason(row.cancellationReason);
}

/** Remove unpaid rent invoice + unified mirror so UNIQUE(booking, month) can accept a fresh row. */
export async function purgeUnpaidRentInvoiceRow(rentInvoiceId: string): Promise<void> {
  const [fi] = await db
    .select({ id: financialInvoices.id })
    .from(financialInvoices)
    .where(
      and(
        eq(financialInvoices.sourceTable, 'rent_invoices'),
        eq(financialInvoices.sourceId, rentInvoiceId),
      ),
    )
    .limit(1);

  if (fi) {
    await db.delete(financialInvoices).where(eq(financialInvoices.id, fi.id));
  }
  await db.delete(rentInvoices).where(eq(rentInvoices.id, rentInvoiceId));
}
