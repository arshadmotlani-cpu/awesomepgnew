/**
 * Count pending payment proofs scoped to a booking — mirrors paymentProofQueue filters.
 */

import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  electricityInvoices,
  paymentLinks,
  pgPaymentRecords,
  rentInvoices,
  stayExtensions,
} from '@/src/db/schema';

export async function countBookingPendingPaymentProofs(bookingId: string): Promise<number> {
  const [
    [qrRow],
    [rentRow],
    [elecRow],
    [extRow],
    [depositRow],
  ] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(pgPaymentRecords)
      .where(and(eq(pgPaymentRecords.bookingId, bookingId), eq(pgPaymentRecords.status, 'pending'))),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(rentInvoices)
      .where(
        and(
          eq(rentInvoices.bookingId, bookingId),
          inArray(rentInvoices.status, ['pending', 'overdue', 'payment_in_progress']),
          isNotNull(rentInvoices.paymentProofUrl),
        ),
      ),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(electricityInvoices)
      .where(
        and(
          eq(electricityInvoices.bookingId, bookingId),
          eq(electricityInvoices.status, 'pending'),
          isNotNull(electricityInvoices.paymentProofUrl),
        ),
      ),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(stayExtensions)
      .where(
        and(
          eq(stayExtensions.bookingId, bookingId),
          eq(stayExtensions.status, 'pending'),
          isNotNull(stayExtensions.paymentProofUrl),
        ),
      ),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(paymentLinks)
      .where(
        and(
          eq(paymentLinks.bookingId, bookingId),
          eq(paymentLinks.purpose, 'deposit'),
          eq(paymentLinks.status, 'active'),
          isNotNull(paymentLinks.paymentProofUrl),
        ),
      ),
  ]);

  return (
    (qrRow?.count ?? 0) +
    (rentRow?.count ?? 0) +
    (elecRow?.count ?? 0) +
    (extRow?.count ?? 0) +
    (depositRow?.count ?? 0)
  );
}
