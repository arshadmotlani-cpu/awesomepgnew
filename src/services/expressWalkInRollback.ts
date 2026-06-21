/**
 * Compensating rollback when express walk-in sale fails after partial writes.
 * Restores occupancy, booking, and ledger state as if Create Invoice never ran.
 */

import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  bedReservations,
  bookings,
  customers,
  financialInvoices,
  rentInvoices,
} from '@/src/db/schema';
import { reconcileBookingOccupancy } from '@/src/lib/occupancySync';
import { getActiveTenancyForCustomer } from '@/src/lib/residentActiveTenancy';
import { cancelBooking } from '@/src/services/bookingLifecycle';
import { adjustDepositCollectedBalance } from '@/src/services/deposits';
import { cancelUnifiedInvoice, refundUnifiedInvoice } from '@/src/services/unifiedInvoices';

export type ExpressWalkInRollbackInput = {
  bookingId: string;
  bookingCode: string;
  customerId: string;
  adminId: string;
  reason?: string;
};

export async function rollbackExpressWalkInSale(
  input: ExpressWalkInRollbackInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const reason =
    input.reason ??
    '[system] Express walk-in rolled back — invoice creation failed mid-flight';

  try {
    await adjustDepositCollectedBalance({
      bookingId: input.bookingId,
      customerId: input.customerId,
      targetCollectedPaise: 0,
      reason,
      createdByAdminId: input.adminId,
    });
  } catch (err) {
    console.error('[expressWalkInRollback] deposit reversal failed', err);
  }

  const rentRows = await db
    .select({ id: rentInvoices.id })
    .from(rentInvoices)
    .where(eq(rentInvoices.bookingId, input.bookingId));

  for (const rent of rentRows) {
    const [fi] = await db
      .select({ id: financialInvoices.id, status: financialInvoices.status })
      .from(financialInvoices)
      .where(
        and(
          eq(financialInvoices.sourceTable, 'rent_invoices'),
          eq(financialInvoices.sourceId, rent.id),
        ),
      )
      .limit(1);

    if (fi) {
      if (fi.status === 'paid' || fi.status === 'partial') {
        await refundUnifiedInvoice(fi.id, reason, { type: 'system', id: input.adminId });
      } else if (fi.status !== 'cancelled' && fi.status !== 'refunded') {
        await cancelUnifiedInvoice(fi.id, reason, { type: 'system', id: input.adminId });
      }
      continue;
    }

    await db
      .update(rentInvoices)
      .set({
        status: 'cancelled',
        cancelledAt: new Date(),
        cancellationReason: reason,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(rentInvoices.id, rent.id),
          inArray(rentInvoices.status, ['pending', 'overdue', 'expired']),
        ),
      );
  }

  const cancelled = await cancelBooking({
    bookingCode: input.bookingCode,
    reason,
    actor: { kind: 'admin', adminId: input.adminId },
  });

  if (!cancelled.ok) {
    await db.transaction(async (tx) => {
      await tx
        .update(bedReservations)
        .set({ status: 'cancelled', updatedAt: new Date() })
        .where(
          and(
            eq(bedReservations.bookingId, input.bookingId),
            inArray(bedReservations.status, ['hold', 'active']),
          ),
        );
      await tx
        .update(bookings)
        .set({
          status: 'cancelled',
          cancelledAt: new Date(),
          cancellationReason: reason,
          updatedAt: new Date(),
        })
        .where(eq(bookings.id, input.bookingId));
    });
  }

  const tenancy = await getActiveTenancyForCustomer(input.customerId);
  if (!tenancy || tenancy.bookingId === input.bookingId) {
    await db
      .update(customers)
      .set({ residencyStatus: 'vacated', updatedAt: new Date() })
      .where(eq(customers.id, input.customerId));
  }

  await reconcileBookingOccupancy(input.bookingId);

  return { ok: true };
}
