/**
 * Vacating rent billing — anniversary model.
 *
 * When a resident gives notice, cancel future rent invoices only.
 * Never recalculate or pro-rate the checkout-month invoice; the resident
 * has already paid through their billing anniversary.
 */

import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { auditLog, rentInvoices } from '@/src/db/schema';
import { formatDate, parseDate } from '@/src/lib/dates';
import { firstOfMonth } from '@/src/services/billing';

export type VacatingCheckoutBillingResult = {
  checkoutMonth: string;
  proratedPaise: number;
  daysActive: number;
  invoiceId: string | null;
  invoiceCreated: boolean;
  invoiceUpdated: boolean;
  futureMonthsCancelled: number;
};

const VACATING_CANCEL_REASON_PREFIX = 'Vacating notice';

/** Cancel pending/overdue rent invoices strictly after the checkout month. */
export async function cancelRentInvoicesAfterCheckoutMonth(
  bookingId: string,
  vacatingDate: string,
  reason: string,
): Promise<{ cancelled: number; ids: string[] }> {
  const checkoutMonth = firstOfMonth(vacatingDate);
  const rows = await db
    .update(rentInvoices)
    .set({
      status: 'cancelled',
      cancelledAt: new Date(),
      cancellationReason: reason,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(rentInvoices.bookingId, bookingId),
        inArray(rentInvoices.status, ['pending', 'overdue']),
        sql`${rentInvoices.billingMonth} > ${checkoutMonth}::date`,
      ),
    )
    .returning({ id: rentInvoices.id });

  if (rows.length > 0) {
    await db.insert(auditLog).values(
      rows.map((r) => ({
        actorType: 'system' as const,
        actorId: null,
        entity: 'rent_invoice',
        entityId: r.id,
        action: 'cancelled',
        diff: { reason, vacatingDate, checkoutMonth },
      })),
    );
    const { syncManyToUnified } = await import('@/src/services/unifiedInvoices');
    await syncManyToUnified(
      rows.map((r) => r.id),
      'rent',
    );
  }

  return { cancelled: rows.length, ids: rows.map((r) => r.id) };
}

/**
 * Cancel future invoices when vacating is filed — no checkout-month rent adjustment.
 */
export async function syncVacatingCheckoutRentBilling(input: {
  bookingId: string;
  vacatingDate: string;
  actorId?: string | null;
  actorType?: 'admin' | 'system';
}): Promise<VacatingCheckoutBillingResult | { ok: false; error: string }> {
  const vacatingDate = formatDate(parseDate(input.vacatingDate));
  const checkoutMonth = firstOfMonth(vacatingDate);

  const future = await cancelRentInvoicesAfterCheckoutMonth(
    input.bookingId,
    vacatingDate,
    `${VACATING_CANCEL_REASON_PREFIX} — checkout ${vacatingDate}`,
  );

  const [existing] = await db
    .select({ id: rentInvoices.id, rentPaise: rentInvoices.rentPaise })
    .from(rentInvoices)
    .where(
      and(
        eq(rentInvoices.bookingId, input.bookingId),
        eq(rentInvoices.billingMonth, checkoutMonth),
        eq(rentInvoices.isAdhoc, false),
      ),
    )
    .limit(1);

  return {
    checkoutMonth,
    proratedPaise: existing?.rentPaise ?? 0,
    daysActive: 0,
    invoiceId: existing?.id ?? null,
    invoiceCreated: false,
    invoiceUpdated: false,
    futureMonthsCancelled: future.cancelled,
  };
}

/**
 * Undo future-month cancellations when a vacating notice is withdrawn.
 */
export async function restoreRentBillingAfterVacatingCancel(args: {
  bookingId: string;
  adminId?: string | null;
}): Promise<{ uncancelled: number; recalculated: number }> {
  const uncancelledRows = await db
    .update(rentInvoices)
    .set({
      status: 'pending',
      cancelledAt: null,
      cancellationReason: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(rentInvoices.bookingId, args.bookingId),
        eq(rentInvoices.status, 'cancelled'),
        sql`${rentInvoices.cancellationReason} LIKE ${`${VACATING_CANCEL_REASON_PREFIX}%`}`,
      ),
    )
    .returning({ id: rentInvoices.id });

  if (uncancelledRows.length > 0) {
    const { syncManyToUnified } = await import('@/src/services/unifiedInvoices');
    await syncManyToUnified(
      uncancelledRows.map((r) => r.id),
      'rent',
    );
  }

  const { recalculateBillingAfterVacatingRestore } = await import(
    '@/src/services/residentFinancialEngine'
  );
  const { updatedCount } = await recalculateBillingAfterVacatingRestore({
    bookingId: args.bookingId,
    adminId: args.adminId,
  });

  return { uncancelled: uncancelledRows.length, recalculated: updatedCount };
}
