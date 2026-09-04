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

/** Matches notes written by `resolveVacatingAwareRentCharge` prorated checkout invoices. */
export const VACATING_MOVE_OUT_PRORATION_NOTE_MARKER = '(move-out proration)';

export function vacatingProrationInvoiceNeedsRestore(input: {
  invoiceNotes: string | null;
  invoiceRentPaise: number;
  paidPrincipalPaise: number;
  eligibleRentPaise: number;
  eligibleNotes: string | null;
  hasActiveVacating: boolean;
  /** When true, invoice was fully paid at the prorated amount — never rewrite. */
  invoiceFullyPaid?: boolean;
}): { toPaise: number; toNotes: string } | null {
  if (input.hasActiveVacating) return null;
  if (input.invoiceFullyPaid) return null;
  if (!input.invoiceNotes?.includes(VACATING_MOVE_OUT_PRORATION_NOTE_MARKER)) return null;
  if (input.eligibleRentPaise <= 0 || !input.eligibleNotes) return null;
  if (
    input.invoiceRentPaise > 0 &&
    input.paidPrincipalPaise >= input.invoiceRentPaise
  ) {
    return null;
  }

  const toPaise = Math.max(input.eligibleRentPaise, input.paidPrincipalPaise);
  const toNotes = input.eligibleNotes;
  if (toPaise === input.invoiceRentPaise && toNotes === input.invoiceNotes) return null;
  return { toPaise, toNotes };
}

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
          ['pending', 'overdue', 'partial', 'payment_in_progress'].includes(existing.status) &&
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
    ['pending', 'overdue', 'partial', 'payment_in_progress'].includes(existing.status) &&
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

/**
 * When vacating is withdrawn/rejected, restore pending prorated checkout invoices
 * to the normal full-month charge from anniversary generation SSOT.
 */
export async function restoreVacatingProratedRentInvoicesForBooking(args: {
  bookingId: string;
  adminId?: string | null;
}): Promise<{
  updatedCount: number;
  invoiceChanges: Array<{
    invoiceId: string;
    billingMonth: string;
    fromPaise: number;
    toPaise: number;
  }>;
}> {
  const active = await loadActiveVacatingForBilling(args.bookingId);
  if (active) return { updatedCount: 0, invoiceChanges: [] };

  const pending = await db
    .select({
      id: rentInvoices.id,
      billingMonth: rentInvoices.billingMonth,
      rentPaise: rentInvoices.rentPaise,
      paidPrincipalPaise: rentInvoices.paidPrincipalPaise,
      notes: rentInvoices.notes,
    })
    .from(rentInvoices)
    .where(
      and(
        eq(rentInvoices.bookingId, args.bookingId),
        eq(rentInvoices.isAdhoc, false),
        inArray(rentInvoices.status, ['pending', 'overdue']),
        sql`${rentInvoices.notes} LIKE ${`%${VACATING_MOVE_OUT_PRORATION_NOTE_MARKER}%`}`,
        sql`coalesce(${rentInvoices.paidPrincipalPaise}, 0) < ${rentInvoices.rentPaise}`,
      ),
    );

  if (pending.length === 0) return { updatedCount: 0, invoiceChanges: [] };

  const { evaluateAnniversaryRentGenerationEligibility } = await import(
    '@/src/services/rentInvoices'
  );
  const asOf = formatDate(new Date());
  const invoiceChanges: Array<{
    invoiceId: string;
    billingMonth: string;
    fromPaise: number;
    toPaise: number;
  }> = [];
  const now = new Date();

  await db.transaction(async (tx) => {
    for (const inv of pending) {
      const eligibility = await evaluateAnniversaryRentGenerationEligibility({
        bookingId: args.bookingId,
        billingMonth: inv.billingMonth,
        asOf,
      });
      if (!eligibility.eligible) continue;

      const paidPrincipal = inv.paidPrincipalPaise ?? 0;
      const restore = vacatingProrationInvoiceNeedsRestore({
        invoiceNotes: inv.notes,
        invoiceRentPaise: inv.rentPaise,
        paidPrincipalPaise: paidPrincipal,
        eligibleRentPaise: eligibility.rentPaise,
        eligibleNotes: eligibility.invoiceNotes ?? null,
        hasActiveVacating: false,
        invoiceFullyPaid: paidPrincipal >= inv.rentPaise && inv.rentPaise > 0,
      });
      if (!restore) continue;

      await tx
        .update(rentInvoices)
        .set({
          rentPaise: restore.toPaise,
          notes: restore.toNotes,
          updatedAt: now,
        })
        .where(eq(rentInvoices.id, inv.id));

      invoiceChanges.push({
        invoiceId: inv.id,
        billingMonth: inv.billingMonth,
        fromPaise: inv.rentPaise,
        toPaise: restore.toPaise,
      });
    }

    if (invoiceChanges.length > 0) {
      await tx.insert(auditLog).values({
        actorType: args.adminId ? 'admin' : 'system',
        actorId: args.adminId ?? null,
        entity: 'rent_invoice',
        entityId: args.bookingId,
        action: 'vacating_proration_restored',
        diff: { invoiceChanges },
      });
    }
  });

  if (invoiceChanges.length > 0) {
    const { syncManyToUnified } = await import('@/src/services/unifiedInvoices');
    await syncManyToUnified(
      invoiceChanges.map((c) => c.invoiceId),
      'rent',
    );
  }

  return { updatedCount: invoiceChanges.length, invoiceChanges };
}

/** Heal pending prorated invoices left behind after vacating withdrawal (platform-wide). */
export async function healOrphanedVacatingProratedRentInvoices(): Promise<{
  healedBookings: number;
  healedInvoices: number;
}> {
  const rows = await db.execute<{ booking_id: string }>(sql`
    SELECT DISTINCT ri.booking_id
    FROM rent_invoices ri
    INNER JOIN bookings bk ON bk.id = ri.booking_id AND bk.status = 'confirmed'
    INNER JOIN bed_reservations br ON br.booking_id = ri.booking_id
      AND br.kind = 'primary'
      AND br.status = 'active'
    WHERE ri.is_adhoc = false
      AND ri.status IN ('pending', 'overdue')
      AND ri.notes LIKE ${`%${VACATING_MOVE_OUT_PRORATION_NOTE_MARKER}%`}
      AND coalesce(ri.paid_principal_paise, 0) < ri.rent_paise
      AND NOT EXISTS (
        SELECT 1 FROM vacating_requests vr
        WHERE vr.booking_id = ri.booking_id
          AND vr.status IN ('pending', 'approved')
      )
  `);

  let healedInvoices = 0;
  for (const row of rows) {
    const result = await restoreVacatingProratedRentInvoicesForBooking({
      bookingId: row.booking_id,
    });
    healedInvoices += result.updatedCount;
  }

  return { healedBookings: rows.length, healedInvoices };
}

/** Undo future-month cancellations when a vacating notice is withdrawn. */
export async function restoreRentBillingAfterVacatingCancel(args: {
  bookingId: string;
  adminId?: string | null;
}): Promise<{ uncancelled: number; recalculated: number; prorationRestored: number }> {
  const proration = await restoreVacatingProratedRentInvoicesForBooking({
    bookingId: args.bookingId,
    adminId: args.adminId,
  });

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

  return {
    uncancelled: uncancelledRows.length,
    recalculated: updatedCount,
    prorationRestored: proration.updatedCount,
  };
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
