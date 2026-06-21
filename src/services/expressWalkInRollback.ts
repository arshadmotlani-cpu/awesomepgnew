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
  depositLedger,
  financialInvoices,
  payments,
  rentInvoices,
} from '@/src/db/schema';
import { reconcileBookingOccupancy } from '@/src/lib/occupancySync';
import { getActiveTenancyForCustomer } from '@/src/lib/residentActiveTenancy';
import { cancelBooking } from '@/src/services/bookingLifecycle';
import { syncDepositCollectionFromLedger } from '@/src/services/depositCollection';
import { adjustDepositCollectedBalance, getDepositSummaryForBooking } from '@/src/services/deposits';
import { applyDepositDeduction } from '@/src/services/depositSettlement';
import { cancelUnifiedInvoice, refundUnifiedInvoice } from '@/src/services/unifiedInvoices';

const DEPOSIT_CREDIT_REASON = 'Deposit credit applied from prior stay wallet';

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
    const adjusted = await adjustDepositCollectedBalance({
      bookingId: input.bookingId,
      customerId: input.customerId,
      targetCollectedPaise: 0,
      reason,
      createdByAdminId: input.adminId,
    });
    if (!adjusted.ok) {
      return { ok: false, error: adjusted.error };
    }
  } catch (err) {
    console.error('[expressWalkInRollback] deposit reversal failed', err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Deposit reversal failed.',
    };
  }

  await db
    .update(payments)
    .set({ status: 'refunded', updatedAt: new Date() })
    .where(
      and(
        eq(payments.bookingId, input.bookingId),
        eq(payments.purpose, 'deposit'),
        eq(payments.status, 'succeeded'),
      ),
    );

  await syncDepositCollectionFromLedger(input.bookingId).catch((err) => {
    console.error('[expressWalkInRollback] deposit sync failed', err);
  });

  const depositSummary = await getDepositSummaryForBooking(input.bookingId);
  if ((depositSummary?.refundableBalancePaise ?? 0) <= 0) {
    await db
      .update(bookings)
      .set({
        depositDuePaise: 0,
        depositCollectionStatus: 'waived',
        updatedAt: new Date(),
      })
      .where(eq(bookings.id, input.bookingId));
  }

  const creditRows = await db
    .select({ id: depositLedger.id, amountPaise: depositLedger.amountPaise })
    .from(depositLedger)
    .where(
      and(
        eq(depositLedger.bookingId, input.bookingId),
        eq(depositLedger.entryKind, 'collected'),
        eq(depositLedger.reason, DEPOSIT_CREDIT_REASON),
      ),
    );
  for (const row of creditRows) {
    await applyDepositDeduction({
      bookingId: input.bookingId,
      customerId: input.customerId,
      amountPaise: row.amountPaise,
      reason: `${reason} — reverse wallet credit`,
      adminId: input.adminId,
    }).catch(() => undefined);
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
