/**
 * Checkout-month rent when a resident files vacating notice.
 * Pro-rates rent for the move-out month (e.g. 1–5 July) and cancels later months.
 */

import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { auditLog, bedReservations, bookings, rentInvoices } from '@/src/db/schema';
import type { PricingSnapshot } from '@/src/db/schema/bookings';
import { addDays, formatDate, parseDate } from '@/src/lib/dates';
import { firstOfMonth, prorateForMonth, dueDateForBillingDay } from '@/src/services/billing';
import { ensureBillingProfileForBooking } from '@/src/services/residentBillingProfiles';
import { _internals as rentInternals } from '@/src/services/rentInvoices';

const { loadStayWindow, monthlyRentFromSnapshot } = rentInternals;

export type VacatingCheckoutBillingResult = {
  checkoutMonth: string;
  proratedPaise: number;
  daysActive: number;
  invoiceId: string | null;
  invoiceCreated: boolean;
  invoiceUpdated: boolean;
  futureMonthsCancelled: number;
};

function pgErrorCode(err: unknown): string | null {
  if (!err || typeof err !== 'object') return null;
  const direct = (err as { code?: unknown }).code;
  if (typeof direct === 'string') return direct;
  const cause = (err as { cause?: unknown }).cause;
  if (cause && typeof cause === 'object') {
    const causeCode = (cause as { code?: unknown }).code;
    if (typeof causeCode === 'string') return causeCode;
  }
  return null;
}

async function nextInvoiceNumber(billingMonth: string, attempt: number): Promise<string> {
  return rentInternals.nextInvoiceNumber(billingMonth, attempt);
}

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
 * Ensure checkout-month rent reflects days from move-in through vacating date.
 * Runs on vacating submit and approve so profile + refund flow show the correct due.
 */
export async function syncVacatingCheckoutRentBilling(input: {
  bookingId: string;
  vacatingDate: string;
  actorId?: string | null;
  actorType?: 'admin' | 'system';
}): Promise<VacatingCheckoutBillingResult | { ok: false; error: string }> {
  const vacatingDate = formatDate(parseDate(input.vacatingDate));
  const checkoutMonth = firstOfMonth(vacatingDate);

  const [booking] = await db
    .select({
      customerId: bookings.customerId,
      pricingSnapshot: bookings.pricingSnapshot,
    })
    .from(bookings)
    .where(eq(bookings.id, input.bookingId))
    .limit(1);
  if (!booking) return { ok: false, error: 'Booking not found.' };

  const monthlyRent = monthlyRentFromSnapshot(booking.pricingSnapshot as PricingSnapshot | null);
  if (monthlyRent <= 0) {
    return { ok: false, error: 'No monthly rent on booking.' };
  }

  const stay = await loadStayWindow(input.bookingId);
  if (!stay) return { ok: false, error: 'No active stay window.' };

  const future = await cancelRentInvoicesAfterCheckoutMonth(
    input.bookingId,
    vacatingDate,
    `${VACATING_CANCEL_REASON_PREFIX} — checkout ${vacatingDate}`,
  );

  const prorated = prorateForMonth({
    monthlyRatePaise: monthlyRent,
    billingMonth: checkoutMonth,
    activeStart: stay.start,
    activeEnd: formatDate(addDays(vacatingDate, 1)),
  });

  if (prorated.amountPaise <= 0) {
    return {
      checkoutMonth,
      proratedPaise: 0,
      daysActive: prorated.daysActive,
      invoiceId: null,
      invoiceCreated: false,
      invoiceUpdated: false,
      futureMonthsCancelled: future.cancelled,
    };
  }

  const profile = await ensureBillingProfileForBooking(input.bookingId);
  const billingDay = profile?.billingDay ?? 5;
  const calendarDue = formatDate(dueDateForBillingDay(checkoutMonth, billingDay));
  const dueDate =
    stay.start > calendarDue ? formatDate(addDays(stay.start, 4)) : calendarDue;
  const notes = prorated.isFullMonth
    ? `Checkout month rent · move-out ${formatDate(parseDate(vacatingDate))}`
    : `Checkout pro-rated: ${prorated.daysActive}/${prorated.daysInMonth} days · move-out ${formatDate(parseDate(vacatingDate))}`;

  const [existing] = await db
    .select()
    .from(rentInvoices)
    .where(
      and(
        eq(rentInvoices.bookingId, input.bookingId),
        eq(rentInvoices.billingMonth, checkoutMonth),
        eq(rentInvoices.isAdhoc, false),
      ),
    )
    .limit(1);

  if (existing?.status === 'paid') {
    return {
      checkoutMonth,
      proratedPaise: prorated.amountPaise,
      daysActive: prorated.daysActive,
      invoiceId: existing.id,
      invoiceCreated: false,
      invoiceUpdated: false,
      futureMonthsCancelled: future.cancelled,
    };
  }

  if (existing && (existing.status === 'pending' || existing.status === 'overdue')) {
    let invoiceUpdated = false;
    if (existing.rentPaise !== prorated.amountPaise) {
      await db
        .update(rentInvoices)
        .set({
          rentPaise: prorated.amountPaise,
          dueDate,
          notes,
          updatedAt: new Date(),
        })
        .where(eq(rentInvoices.id, existing.id));
      const { syncRentInvoiceToUnified } = await import('@/src/services/unifiedInvoices');
      await syncRentInvoiceToUnified(existing.id);
      await db.insert(auditLog).values({
        actorType: input.actorType ?? 'system',
        actorId: input.actorId ?? null,
        entity: 'rent_invoice',
        entityId: existing.id,
        action: 'vacating_checkout_prorate',
        diff: {
          vacatingDate,
          fromPaise: existing.rentPaise,
          toPaise: prorated.amountPaise,
          daysActive: prorated.daysActive,
        },
      });
      invoiceUpdated = true;
    }
    return {
      checkoutMonth,
      proratedPaise: prorated.amountPaise,
      daysActive: prorated.daysActive,
      invoiceId: existing.id,
      invoiceCreated: false,
      invoiceUpdated,
      futureMonthsCancelled: future.cancelled,
    };
  }

  const [bedRow] = await db.execute<{ bed_id: string; pg_id: string }>(sql`
    SELECT br.bed_id::text AS bed_id, f.pg_id::text AS pg_id
    FROM bed_reservations br
    INNER JOIN beds b ON b.id = br.bed_id
    INNER JOIN rooms r ON r.id = b.room_id
    INNER JOIN floors f ON f.id = r.floor_id
    WHERE br.booking_id = ${input.bookingId}::uuid
      AND br.status = 'active'
      AND br.kind = 'primary'
    LIMIT 1
  `);
  const bedId = bedRow?.bed_id;
  const pgId = bedRow?.pg_id;
  if (!bedId || !pgId) return { ok: false, error: 'Bed context missing for invoice.' };

  let insertedId: string | null = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const invoiceNumber = await nextInvoiceNumber(checkoutMonth, attempt);
    try {
      const [row] = await db
        .insert(rentInvoices)
        .values({
          invoiceNumber,
          bookingId: input.bookingId,
          customerId: booking.customerId,
          bedId,
          pgId,
          billingMonth: checkoutMonth,
          dueDate,
          rentPaise: prorated.amountPaise,
          status: 'pending',
          notes,
        })
        .onConflictDoNothing({
          target: [rentInvoices.bookingId, rentInvoices.billingMonth],
        })
        .returning({ id: rentInvoices.id });
      if (row) {
        insertedId = row.id;
        break;
      }
      const [race] = await db
        .select({ id: rentInvoices.id })
        .from(rentInvoices)
        .where(
          and(
            eq(rentInvoices.bookingId, input.bookingId),
            eq(rentInvoices.billingMonth, checkoutMonth),
          ),
        )
        .limit(1);
      if (race) {
        insertedId = race.id;
        break;
      }
    } catch (err) {
      if (pgErrorCode(err) === '23505') continue;
      throw err;
    }
  }

  if (insertedId) {
    const { syncRentInvoiceToUnified } = await import('@/src/services/unifiedInvoices');
    await syncRentInvoiceToUnified(insertedId);
    await db.insert(auditLog).values({
      actorType: input.actorType ?? 'system',
      actorId: input.actorId ?? null,
      entity: 'rent_invoice',
      entityId: insertedId,
      action: 'vacating_checkout_generated',
      diff: {
        vacatingDate,
        billingMonth: checkoutMonth,
        rentPaise: prorated.amountPaise,
        daysActive: prorated.daysActive,
      },
    });
  }

  return {
    checkoutMonth,
    proratedPaise: prorated.amountPaise,
    daysActive: prorated.daysActive,
    invoiceId: insertedId,
    invoiceCreated: Boolean(insertedId),
    invoiceUpdated: false,
    futureMonthsCancelled: future.cancelled,
  };
}

/**
 * Undo checkout-month proration and future-month cancellations when a vacating
 * notice is withdrawn, rejected, or reverted.
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
