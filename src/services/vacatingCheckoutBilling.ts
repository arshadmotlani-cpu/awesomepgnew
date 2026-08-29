/**
 * Vacating rent billing — vacating date controls chargeable rent via BCM SSOT.
 *
 * Active move-out (pending or approved): cancel future invoices and ensure the
 * checkout-period rent invoice reflects prorated occupancy only. Tail rent is a
 * payable rent invoice, not a deposit settlement deduction.
 */

import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { auditLog, bedReservations, bookings, rentInvoices, vacatingRequests } from '@/src/db/schema';
import {
  resolveVacatingAwareRentCharge,
  type ActiveVacatingForBilling,
  type VacatingAwareRentCharge,
} from '@/src/lib/billing/billingCoverageModel';
import { VACATING_FINAL_PERIOD_CANCEL_REASON_SUFFIX } from '@/src/lib/billing/vacatingFinalPeriodRent';
import { ACTIVE_VACATING_STATUSES } from '@/src/lib/vacating/activeRequestPolicy';
import { formatDate, parseDate } from '@/src/lib/dates';
import {
  billingPeriodForPolicy,
  calendarMonthBillingPeriod,
  firstOfMonth,
  graceEndDateFromIssue,
  type BillingCyclePolicy,
} from '@/src/services/billing';
import { loadBillingCoverageModel } from '@/src/services/billingCoverage';
import { getBillingProfileForBooking } from '@/src/services/residentBillingProfiles';

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
  charge: VacatingAwareRentCharge | null;
};

const VACATING_CANCEL_REASON_PREFIX = 'Vacating notice';

function pgErrorCode(err: unknown): string | null {
  if (!err || typeof err !== 'object') return null;
  const direct = (err as { code?: unknown }).code;
  if (typeof direct === 'string') return direct;
  const cause = (err as { cause?: unknown }).cause;
  if (cause && typeof cause === 'object') {
    const c = (cause as { code?: unknown }).code;
    if (typeof c === 'string') return c;
  }
  return null;
}

async function loadActiveVacatingForBilling(
  bookingId: string,
): Promise<(ActiveVacatingForBilling & { monthlyRentPaiseSnapshot: number }) | null> {
  const [row] = await db
    .select({
      status: vacatingRequests.status,
      vacatingDate: vacatingRequests.vacatingDate,
      monthlyRentPaiseSnapshot: vacatingRequests.monthlyRentPaiseSnapshot,
    })
    .from(vacatingRequests)
    .where(
      and(
        eq(vacatingRequests.bookingId, bookingId),
        inArray(vacatingRequests.status, [...ACTIVE_VACATING_STATUSES]),
      ),
    )
    .orderBy(sql`${vacatingRequests.updatedAt} DESC`)
    .limit(1);
  if (!row) return null;
  return {
    status: row.status as 'pending' | 'approved',
    vacatingDate: formatDate(parseDate(String(row.vacatingDate))),
    monthlyRentPaiseSnapshot: row.monthlyRentPaiseSnapshot,
  };
}

async function loadBookingBillingContext(bookingId: string) {
  const [booking] = await db
    .select({ customerId: bookings.customerId })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);
  if (!booking) return null;

  const [bedRow] = await db
    .select({ bedId: bedReservations.bedId })
    .from(bedReservations)
    .where(and(eq(bedReservations.bookingId, bookingId), eq(bedReservations.status, 'active')))
    .orderBy(bedReservations.bedId)
    .limit(1);
  if (!bedRow) return null;

  const [pgRow] = await db.execute<{ pg_id: string }>(sql`
    SELECT f.pg_id AS pg_id
    FROM beds b
    JOIN rooms r ON r.id = b.room_id
    JOIN floors f ON f.id = r.floor_id
    WHERE b.id = ${bedRow.bedId}
    LIMIT 1
  `);
  const pgId = pgRow?.pg_id;
  if (!pgId) return null;

  const profile = await getBillingProfileForBooking(bookingId);
  return {
    customerId: booking.customerId,
    bedId: bedRow.bedId,
    pgId,
    billingDay: profile?.billingDay ?? 5,
    billingCyclePolicy: (profile?.billingCyclePolicy ?? 'anniversary') as BillingCyclePolicy,
  };
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

async function restoreFullMonthInvoicesCancelledForVacating(args: {
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

async function adjustExistingRentInvoiceForVacating(args: {
  invoiceId: string;
  bookingId: string;
  billingMonth: string;
  fromPaise: number;
  toPaise: number;
  notes: string;
  vacatingDate: string;
  actorId?: string | null;
  actorType?: 'admin' | 'system';
}): Promise<boolean> {
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(rentInvoices)
      .set({
        rentPaise: args.toPaise,
        notes: args.notes,
        updatedAt: now,
      })
      .where(eq(rentInvoices.id, args.invoiceId));

    await tx.insert(auditLog).values({
      actorType: args.actorType ?? 'system',
      actorId: args.actorId ?? null,
      entity: 'rent_invoice',
      entityId: args.invoiceId,
      action: 'vacating_proration_adjust',
      diff: {
        bookingId: args.bookingId,
        billingMonth: args.billingMonth,
        fromPaise: args.fromPaise,
        toPaise: args.toPaise,
        vacatingDate: args.vacatingDate,
        reason: 'vacating_date_adjustment',
      },
    });
  });

  const { syncRentInvoiceToUnified } = await import('@/src/services/unifiedInvoices');
  await syncRentInvoiceToUnified(args.invoiceId);
  return true;
}

async function createProratedVacatingRentInvoice(args: {
  bookingId: string;
  customerId: string;
  bedId: string;
  pgId: string;
  billingMonth: string;
  rentPaise: number;
  notes: string;
  vacatingDate: string;
  actorId?: string | null;
  actorType?: 'admin' | 'system';
}): Promise<{ id: string } | null> {
  const issueDate = formatDate(new Date());
  const dueDate = formatDate(graceEndDateFromIssue(issueDate));
  const { nextInvoiceNumberForBillingMonth } = await import('@/src/services/rentInvoices');

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const invoiceNumber = await nextInvoiceNumberForBillingMonth(args.billingMonth, attempt);
    try {
      const row = await db.transaction(async (tx) => {
        const [inserted] = await tx
          .insert(rentInvoices)
          .values({
            invoiceNumber,
            bookingId: args.bookingId,
            customerId: args.customerId,
            bedId: args.bedId,
            pgId: args.pgId,
            billingMonth: args.billingMonth,
            dueDate,
            rentPaise: args.rentPaise,
            status: 'pending',
            notes: args.notes,
          })
          .onConflictDoNothing({
            target: [rentInvoices.bookingId, rentInvoices.billingMonth],
            where: sql`${rentInvoices.isAdhoc} = false`,
          })
          .returning({ id: rentInvoices.id });
        if (!inserted) return null;
        await tx.insert(auditLog).values({
          actorType: args.actorType ?? 'system',
          actorId: args.actorId ?? null,
          entity: 'rent_invoice',
          entityId: inserted.id,
          action: 'vacating_proration_created',
          diff: {
            bookingId: args.bookingId,
            billingMonth: args.billingMonth,
            rentPaise: args.rentPaise,
            vacatingDate: args.vacatingDate,
          },
        });
        return inserted;
      });
      if (!row) return null;
      const { syncRentInvoiceToUnified } = await import('@/src/services/unifiedInvoices');
      await syncRentInvoiceToUnified(row.id);
      return row;
    } catch (err) {
      if (pgErrorCode(err) === '23505') continue;
      throw err;
    }
  }
  return null;
}

async function applyVacatingAwareRentCharge(args: {
  bookingId: string;
  vacatingDate: string;
  charge: VacatingAwareRentCharge;
  billingMonth: string;
  actorId?: string | null;
  actorType?: 'admin' | 'system';
}): Promise<{
  invoiceId: string | null;
  invoiceCreated: boolean;
  invoiceUpdated: boolean;
  finalPeriodInvoiceCancelled: boolean;
  finalPeriodInvoiceRestored: boolean;
}> {
  const ctx = await loadBookingBillingContext(args.bookingId);
  if (!ctx) {
    return {
      invoiceId: null,
      invoiceCreated: false,
      invoiceUpdated: false,
      finalPeriodInvoiceCancelled: false,
      finalPeriodInvoiceRestored: false,
    };
  }

  const [existing] = await db
    .select({
      id: rentInvoices.id,
      rentPaise: rentInvoices.rentPaise,
      paidPrincipalPaise: rentInvoices.paidPrincipalPaise,
      status: rentInvoices.status,
    })
    .from(rentInvoices)
    .where(
      and(
        eq(rentInvoices.bookingId, args.bookingId),
        eq(rentInvoices.billingMonth, args.billingMonth),
        eq(rentInvoices.isAdhoc, false),
      ),
    )
    .limit(1);

  let finalPeriodInvoiceRestored = false;
  let invoiceCreated = false;
  let invoiceUpdated = false;
  let invoiceId = existing?.id ?? null;

  switch (args.charge.billingAction) {
    case 'skip_past_checkout':
    case 'skip_already_paid':
    case 'skip_no_charge':
    case 'no_change':
      break;
    case 'generate_full':
    case 'generate_prorated':
      if (!existing && args.charge.invoiceNotes) {
        const created = await createProratedVacatingRentInvoice({
          bookingId: args.bookingId,
          customerId: ctx.customerId,
          bedId: ctx.bedId,
          pgId: ctx.pgId,
          billingMonth: args.billingMonth,
          rentPaise: args.charge.chargeablePaise,
          notes: args.charge.invoiceNotes,
          vacatingDate: args.vacatingDate,
          actorId: args.actorId,
          actorType: args.actorType,
        });
        if (created) {
          invoiceCreated = true;
          invoiceId = created.id;
        }
      }
      break;
    case 'adjust_existing':
      if (existing && args.charge.invoiceNotes) {
        const paid = existing.paidPrincipalPaise ?? 0;
        if (paid > args.charge.chargeablePaise) {
          break;
        }
        if (
          ['pending', 'overdue', 'partial'].includes(existing.status) &&
          existing.rentPaise !== args.charge.chargeablePaise
        ) {
          invoiceUpdated = await adjustExistingRentInvoiceForVacating({
            invoiceId: existing.id,
            bookingId: args.bookingId,
            billingMonth: args.billingMonth,
            fromPaise: existing.rentPaise,
            toPaise: Math.max(args.charge.chargeablePaise, paid),
            notes: args.charge.invoiceNotes,
            vacatingDate: args.vacatingDate,
            actorId: args.actorId,
            actorType: args.actorType,
          });
          invoiceId = existing.id;
        }
      }
      break;
    default:
      break;
  }

  if (
    args.charge.billingAction === 'generate_full' &&
    existing &&
    ['pending', 'overdue', 'partial'].includes(existing.status) &&
    existing.rentPaise !== args.charge.chargeablePaise &&
    (existing.paidPrincipalPaise ?? 0) <= args.charge.chargeablePaise &&
    args.charge.invoiceNotes
  ) {
    invoiceUpdated = await adjustExistingRentInvoiceForVacating({
      invoiceId: existing.id,
      bookingId: args.bookingId,
      billingMonth: args.billingMonth,
      fromPaise: existing.rentPaise,
      toPaise: args.charge.chargeablePaise,
      notes: args.charge.invoiceNotes,
      vacatingDate: args.vacatingDate,
      actorId: args.actorId,
      actorType: args.actorType,
    });
    invoiceId = existing.id;
  }

  if (!args.charge.collectViaRentInvoice && !existing) {
    finalPeriodInvoiceRestored = await restoreFullMonthInvoicesCancelledForVacating({
      bookingId: args.bookingId,
      adminId: args.actorId,
    });
  }

  return {
    invoiceId,
    invoiceCreated,
    invoiceUpdated,
    finalPeriodInvoiceCancelled: false,
    finalPeriodInvoiceRestored,
  };
}

function resolveBillingPeriodForCheckoutMonth(args: {
  checkoutMonth: string;
  billingDay: number;
  billingCyclePolicy: BillingCyclePolicy;
  vacatingDate: string;
}): { periodStart: string; periodEnd: string } {
  if (args.billingCyclePolicy === 'calendar_month_1st') {
    return calendarMonthBillingPeriod(args.checkoutMonth);
  }
  const period = billingPeriodForPolicy(args.billingCyclePolicy, {
    dueDate: args.vacatingDate,
    billingDay: args.billingDay,
    billingMonth: args.checkoutMonth,
  });
  return { periodStart: period.periodStart, periodEnd: period.periodEnd };
}

/** Sync rent invoices when vacating is submitted, approved, or vacating date changes. */
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

  const active = await loadActiveVacatingForBilling(input.bookingId);
  if (!active) {
    return {
      checkoutMonth,
      proratedPaise: 0,
      daysActive: 0,
      invoiceId: null,
      invoiceCreated: false,
      invoiceUpdated: false,
      futureMonthsCancelled: future.cancelled,
      finalPeriodInvoiceCancelled: false,
      finalPeriodInvoiceRestored: false,
      charge: null,
    };
  }

  const coverage = await loadBillingCoverageModel({
    bookingId: input.bookingId,
    vacatingDate,
    monthlyRentPaise: active.monthlyRentPaiseSnapshot,
    treatAsApprovedForTail: true,
  });
  if (!coverage) {
    return { ok: false, error: 'Could not load billing coverage.' };
  }

  const billingPeriod = resolveBillingPeriodForCheckoutMonth({
    checkoutMonth,
    billingDay: coverage.billingDay,
    billingCyclePolicy: coverage.billingCyclePolicy,
    vacatingDate,
  });

  const [existing] = await db
    .select({
      id: rentInvoices.id,
      rentPaise: rentInvoices.rentPaise,
      paidPrincipalPaise: rentInvoices.paidPrincipalPaise,
      status: rentInvoices.status,
    })
    .from(rentInvoices)
    .where(
      and(
        eq(rentInvoices.bookingId, input.bookingId),
        eq(rentInvoices.billingMonth, checkoutMonth),
        eq(rentInvoices.isAdhoc, false),
      ),
    )
    .limit(1);

  const { fullMonthlyRentPaise } = await import('@/src/services/billing');
  const fullMonthPaise = fullMonthlyRentPaise(active.monthlyRentPaiseSnapshot);

  const charge = resolveVacatingAwareRentCharge({
    billingMonth: checkoutMonth,
    billingDay: coverage.billingDay,
    billingCyclePolicy: coverage.billingCyclePolicy,
    moveInDate: coverage.moveInDate,
    monthlyRentPaise: active.monthlyRentPaiseSnapshot,
    paidInvoiceCoverage: coverage.paidInvoiceCoverage,
    activeVacating: active,
    fullMonthRentPaise: fullMonthPaise,
    billingPeriod,
    existingInvoice: existing ?? null,
  });

  const applied = await applyVacatingAwareRentCharge({
    bookingId: input.bookingId,
    vacatingDate,
    charge,
    billingMonth: checkoutMonth,
    actorId: input.actorId,
    actorType: input.actorType,
  });

  return {
    checkoutMonth,
    proratedPaise: charge.chargeablePaise,
    daysActive: charge.chargeableDays,
    invoiceId: applied.invoiceId,
    invoiceCreated: applied.invoiceCreated,
    invoiceUpdated: applied.invoiceUpdated,
    futureMonthsCancelled: future.cancelled,
    finalPeriodInvoiceCancelled: applied.finalPeriodInvoiceCancelled,
    finalPeriodInvoiceRestored: applied.finalPeriodInvoiceRestored,
    charge,
  };
}

/** Undo future-month cancellations when a vacating notice is withdrawn. */
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

/** Active vacating proration decision for anniversary generation. */
export async function resolveVacatingFinalPeriodInvoiceSuppression(
  bookingId: string,
): Promise<import('@/src/lib/billing/vacatingFinalPeriodRent').VacatingFinalPeriodRentDecision | null> {
  const active = await loadActiveVacatingForBilling(bookingId);
  if (!active) return null;

  const coverage = await loadBillingCoverageModel({
    bookingId,
    vacatingDate: active.vacatingDate,
    monthlyRentPaise: active.monthlyRentPaiseSnapshot,
    treatAsApprovedForTail: true,
  });
  return coverage?.tailRent ?? null;
}
