/**
 * Vacating rent billing — anniversary model.
 *
 * Approved move-out: cancel future invoices and, when vacating falls inside an
 * unpaid anniversary period before period end, cancel that period's pending
 * invoice and collect tail rent in checkout settlement instead.
 */

import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { auditLog, rentInvoices, vacatingRequests } from '@/src/db/schema';
import {
  computeVacatingFinalPeriodRentDecision,
  VACATING_FINAL_PERIOD_CANCEL_REASON_SUFFIX,
} from '@/src/lib/billing/vacatingFinalPeriodRent';
import { formatDate, parseDate } from '@/src/lib/dates';
import { firstOfMonth } from '@/src/services/billing';
import { loadBillingCoverageModel } from '@/src/services/billingCoverage';

export type VacatingCheckoutBillingResult = {
  checkoutMonth: string;
  proratedPaise: number;
  daysActive: number;
  invoiceId: string | null;
  invoiceCreated: boolean;
  invoiceUpdated: boolean;
  futureMonthsCancelled: number;
  finalPeriodInvoiceCancelled: boolean;
  finalPeriodInvoiceRestored: boolean;
};

const VACATING_CANCEL_REASON_PREFIX = 'Vacating notice';

async function loadApprovedVacatingForBilling(bookingId: string) {
  const [row] = await db
    .select({
      id: vacatingRequests.id,
      status: vacatingRequests.status,
      vacatingDate: vacatingRequests.vacatingDate,
      monthlyRentPaiseSnapshot: vacatingRequests.monthlyRentPaiseSnapshot,
    })
    .from(vacatingRequests)
    .where(
      and(
        eq(vacatingRequests.bookingId, bookingId),
        eq(vacatingRequests.status, 'approved'),
      ),
    )
    .orderBy(sql`${vacatingRequests.updatedAt} DESC`)
    .limit(1);
  return row ?? null;
}

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

async function cancelFinalPeriodInvoice(args: {
  bookingId: string;
  billingMonth: string;
  reason: string;
  vacatingDate: string;
}): Promise<boolean> {
  const rows = await db
    .update(rentInvoices)
    .set({
      status: 'cancelled',
      cancelledAt: new Date(),
      cancellationReason: args.reason,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(rentInvoices.bookingId, args.bookingId),
        eq(rentInvoices.billingMonth, args.billingMonth),
        eq(rentInvoices.isAdhoc, false),
        inArray(rentInvoices.status, ['pending', 'overdue']),
      ),
    )
    .returning({ id: rentInvoices.id });

  if (rows.length === 0) return false;

  await db.insert(auditLog).values(
    rows.map((r) => ({
      actorType: 'system' as const,
      actorId: null,
      entity: 'rent_invoice',
      entityId: r.id,
      action: 'cancelled',
      diff: {
        reason: args.reason,
        vacatingDate: args.vacatingDate,
        billingMonth: args.billingMonth,
        finalPeriod: true,
      },
    })),
  );
  const { syncManyToUnified } = await import('@/src/services/unifiedInvoices');
  await syncManyToUnified(
    rows.map((r) => r.id),
    'rent',
  );
  return true;
}

async function restoreFinalPeriodInvoicesWhenNotSuppressing(args: {
  bookingId: string;
  adminId?: string | null;
}): Promise<boolean> {
  const rows = await db
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
        eq(rentInvoices.isAdhoc, false),
        eq(rentInvoices.status, 'cancelled'),
        sql`${rentInvoices.cancellationReason} LIKE ${`%${VACATING_FINAL_PERIOD_CANCEL_REASON_SUFFIX}%`}`,
      ),
    )
    .returning({ id: rentInvoices.id });

  if (rows.length === 0) return false;

  const { syncManyToUnified } = await import('@/src/services/unifiedInvoices');
  await syncManyToUnified(
    rows.map((r) => r.id),
    'rent',
  );

  const { recalculateBillingAfterVacatingRestore } = await import(
    '@/src/services/residentFinancialEngine'
  );
  await recalculateBillingAfterVacatingRestore({
    bookingId: args.bookingId,
    adminId: args.adminId,
  });

  return true;
}

/**
 * Sync rent invoices when vacating is approved or vacating date changes.
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

  const approved = await loadApprovedVacatingForBilling(input.bookingId);
  let finalPeriodInvoiceCancelled = false;
  let finalPeriodInvoiceRestored = false;

  if (approved) {
    const coverage = await loadBillingCoverageModel({
      bookingId: input.bookingId,
      vacatingDate,
      monthlyRentPaise: approved.monthlyRentPaiseSnapshot,
      treatAsApprovedForTail: true,
    });
    const decision = coverage?.tailRent ?? computeVacatingFinalPeriodRentDecision({
      vacatingApproved: false,
      vacatingDate,
      billingDay: 5,
      moveInDate: vacatingDate,
      monthlyRentPaise: 0,
      paidPeriods: [],
    });

    if (decision.shouldSuppressFinalInvoice && decision.invoiceBillingMonth) {
      finalPeriodInvoiceCancelled = await cancelFinalPeriodInvoice({
        bookingId: input.bookingId,
        billingMonth: decision.invoiceBillingMonth,
        reason:
          decision.cancellationReason ??
          `${VACATING_CANCEL_REASON_PREFIX} — ${VACATING_FINAL_PERIOD_CANCEL_REASON_SUFFIX}`,
        vacatingDate,
      });
    } else {
      finalPeriodInvoiceRestored = await restoreFinalPeriodInvoicesWhenNotSuppressing({
        bookingId: input.bookingId,
        adminId: input.actorId,
      });
    }
  }

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
    finalPeriodInvoiceCancelled,
    finalPeriodInvoiceRestored,
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

/** Approved vacating final-period suppression for anniversary generation. */
export async function resolveVacatingFinalPeriodInvoiceSuppression(
  bookingId: string,
): Promise<import('@/src/lib/billing/vacatingFinalPeriodRent').VacatingFinalPeriodRentDecision | null> {
  const approved = await loadApprovedVacatingForBilling(bookingId);
  if (!approved) return null;

  const vacatingDate = formatDate(parseDate(String(approved.vacatingDate)));
  const coverage = await loadBillingCoverageModel({
    bookingId,
    vacatingDate,
    monthlyRentPaise: approved.monthlyRentPaiseSnapshot,
    treatAsApprovedForTail: true,
  });
  return coverage?.tailRent ?? null;
}
