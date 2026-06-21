/**
 * Repair partial express walk-in sales: restore missing rent invoice / unified mirror
 * and cancel superseded customer bookings for the same resident.
 */

import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm';
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
import { recordExpressCollection } from '@/src/services/expressCollection';
import { cancelBooking } from '@/src/services/bookingLifecycle';
import {
  enrichExpressWalkInUnifiedBreakdown,
  syncRentInvoiceToUnified,
} from '@/src/services/unifiedInvoices';

export type ExpressWalkInRepairReport = {
  bookingId: string;
  bookingCode: string;
  customerName: string;
  issues: string[];
  actions: string[];
  rentInvoiceId?: string | null;
  financialInvoiceId?: string | null;
  cancelledDuplicateBookingCodes: string[];
};

export type ExpressWalkInRepairInput = {
  bookingId?: string;
  bookingCode?: string;
  expectedRentPaidPaise?: number;
  paymentMethod?: 'cash' | 'upi' | 'bank_transfer' | 'other';
  paymentDate?: string;
  actorAdminId?: string;
  cancelDuplicateBookings?: boolean;
};

function parseExpressRentFromNotes(notes: string | null): number | null {
  if (!notes) return null;
  const m = notes.match(/Rent ₹([\d,]+)/);
  if (!m) return null;
  const inr = Number.parseInt(m[1].replace(/,/g, ''), 10);
  return Number.isFinite(inr) ? inr * 100 : null;
}

async function loadBooking(input: ExpressWalkInRepairInput) {
  const filter = input.bookingId
    ? eq(bookings.id, input.bookingId)
    : input.bookingCode
      ? eq(bookings.bookingCode, input.bookingCode)
      : null;
  if (!filter) return null;

  const [row] = await db
    .select({
      booking: bookings,
      customerName: customers.fullName,
    })
    .from(bookings)
    .innerJoin(customers, eq(customers.id, bookings.customerId))
    .where(filter)
    .limit(1);

  return row ?? null;
}

export async function auditExpressWalkInRepair(
  input: ExpressWalkInRepairInput,
): Promise<ExpressWalkInRepairReport | { ok: false; error: string }> {
  const row = await loadBooking(input);
  if (!row) return { ok: false, error: 'Booking not found.' };

  const { booking, customerName } = row;
  const issues: string[] = [];
  const actions: string[] = [];

  if (booking.createdVia !== 'admin') {
    issues.push(`Booking was not created via admin express walk-in (created_via=${booking.createdVia}).`);
  }
  if (booking.status !== 'confirmed') {
    issues.push(`Booking status is "${booking.status}" — expected confirmed.`);
  }

  const [reservation] = await db
    .select({ status: bedReservations.status })
    .from(bedReservations)
    .where(and(eq(bedReservations.bookingId, booking.id), eq(bedReservations.kind, 'primary')))
    .limit(1);
  if (!reservation || reservation.status !== 'active') {
    issues.push('No active primary bed reservation.');
  } else {
    actions.push('Active bed assignment present.');
  }

  const rentRows = await db
    .select()
    .from(rentInvoices)
    .where(eq(rentInvoices.bookingId, booking.id));
  if (rentRows.length === 0) {
    issues.push('Missing rent_invoices row — rent collection did not persist.');
  } else if (rentRows.length > 1) {
    issues.push(`Multiple rent invoices (${rentRows.length}) — possible duplicate revenue.`);
  }

  const finRows = await db
    .select()
    .from(financialInvoices)
    .where(eq(financialInvoices.bookingId, booking.id));
  if (finRows.length === 0) {
    issues.push('Missing financial_invoices row — invoice invisible in Invoices module.');
  } else if (finRows.length > 1) {
    issues.push(`Multiple financial invoices (${finRows.length}).`);
  }

  const dupes = await db
    .select({ bookingCode: bookings.bookingCode, status: bookings.status })
    .from(bookings)
    .where(
      and(
        eq(bookings.customerId, booking.customerId),
        ne(bookings.id, booking.id),
        inArray(bookings.status, ['pending_payment', 'confirmed']),
      ),
    );

  const expectedRent =
    input.expectedRentPaidPaise ??
    parseExpressRentFromNotes(booking.notes) ??
    Math.max(0, booking.totalPaise - booking.depositPaise);

  if (rentRows.length === 0 && expectedRent > 0) {
    actions.push(`Will record missing historical rent ₹${(expectedRent / 100).toLocaleString('en-IN')}.`);
  }
  if (rentRows.length > 0 && finRows.length === 0) {
    actions.push('Will sync existing rent invoice to financial_invoices.');
  }
  if (dupes.length > 0 && input.cancelDuplicateBookings !== false) {
    actions.push(`Will cancel ${dupes.length} superseded booking(s).`);
  }

  return {
    bookingId: booking.id,
    bookingCode: booking.bookingCode,
    customerName,
    issues,
    actions,
    rentInvoiceId: rentRows[0]?.id ?? null,
    financialInvoiceId: finRows[0]?.id ?? null,
    cancelledDuplicateBookingCodes: [],
  };
}

export async function repairExpressWalkInTransaction(
  input: ExpressWalkInRepairInput & { execute?: boolean },
): Promise<
  | { ok: true; report: ExpressWalkInRepairReport }
  | { ok: false; error: string; report?: ExpressWalkInRepairReport }
> {
  const audit = await auditExpressWalkInRepair(input);
  if ('ok' in audit && audit.ok === false) return audit;
  const report = audit as ExpressWalkInRepairReport;

  if (!input.execute) {
    return { ok: true, report };
  }

  const row = await loadBooking(input);
  if (!row) return { ok: false, error: 'Booking not found.', report };

  const { booking } = row;
  const actorId = input.actorAdminId ?? booking.createdByAdminId ?? 'system-repair';
  const paymentMethod = input.paymentMethod ?? 'upi';
  const paymentDate = input.paymentDate ?? booking.createdAt.toISOString().slice(0, 10);

  const expectedRent =
    input.expectedRentPaidPaise ??
    parseExpressRentFromNotes(booking.notes) ??
    Math.max(0, booking.totalPaise - booking.depositPaise);

  let rentInvoiceId = report.rentInvoiceId;
  if (!rentInvoiceId) {
    const [existingRent] = await db
      .select({ id: rentInvoices.id })
      .from(rentInvoices)
      .where(eq(rentInvoices.bookingId, booking.id))
      .limit(1);
    rentInvoiceId = existingRent?.id ?? null;
  }

  if (!rentInvoiceId && expectedRent > 0) {
    const billingMonth = paymentDate.slice(0, 7) + '-01';
    const rent = await recordExpressCollection({
      customerId: booking.customerId,
      bookingId: booking.id,
      chargeType: 'rent',
      amountPaise: expectedRent,
      billingMonth,
      paymentDate,
      paymentMethod,
      notes: booking.notes,
      createAsPaid: true,
      actorId,
    });
    if (!rent.ok) {
      return { ok: false, error: rent.error, report };
    }
    rentInvoiceId = rent.rentInvoiceId ?? null;
    report.actions.push(`Recorded historical rent (${rent.invoiceNumber ?? rentInvoiceId}).`);
  }

  if (rentInvoiceId) {
    await finalizeExpressHistoricalRentInvoice(rentInvoiceId, booking.id);

    const unifiedId = await syncRentInvoiceToUnified(rentInvoiceId);
    if (!unifiedId) {
      return { ok: false, error: 'Unified invoice sync failed after rent repair.', report };
    }
    report.financialInvoiceId = unifiedId;
    report.rentInvoiceId = rentInvoiceId;
    await enrichExpressWalkInUnifiedBreakdown(booking.id, unifiedId);
    report.actions.push(`Synced unified invoice ${unifiedId}.`);
  }

  if (input.cancelDuplicateBookings !== false) {
    const dupes = await db
      .select({ bookingCode: bookings.bookingCode })
      .from(bookings)
      .where(
        and(
          eq(bookings.customerId, booking.customerId),
          ne(bookings.id, booking.id),
          inArray(bookings.status, ['pending_payment', 'confirmed']),
        ),
      );

    for (const dupe of dupes) {
      const cancelled = await cancelBooking({
        bookingCode: dupe.bookingCode,
        reason: `[repair] Superseded by express walk-in ${booking.bookingCode}`,
        actor: { kind: 'admin', adminId: actorId },
      });
      if (cancelled.ok) {
        report.cancelledDuplicateBookingCodes.push(dupe.bookingCode);
        report.actions.push(`Cancelled duplicate booking ${dupe.bookingCode}.`);
      }
    }
  }

  const postAudit = await auditExpressWalkInRepair({ bookingId: booking.id });
  if ('issues' in postAudit) {
    report.issues = postAudit.issues;
  }

  if (report.issues.some((i) => i.includes('Missing rent') || i.includes('Missing financial'))) {
    return { ok: false, error: 'Repair incomplete — issues remain.', report };
  }

  return { ok: true, report };
}

/** Correct rent rows where historical express collection split principal/late fee incorrectly. */
async function finalizeExpressHistoricalRentInvoice(
  rentInvoiceId: string,
  bookingId: string,
): Promise<void> {
  const [rent] = await db
    .select({
      id: rentInvoices.id,
      rentPaise: rentInvoices.rentPaise,
      status: rentInvoices.status,
      paymentId: rentInvoices.paymentId,
    })
    .from(rentInvoices)
    .where(eq(rentInvoices.id, rentInvoiceId))
    .limit(1);
  if (!rent || rent.status === 'paid') return;

  const [pay] = await db
    .select({ id: payments.id, amountPaise: payments.amountPaise, paidAt: payments.paidAt })
    .from(payments)
    .where(and(eq(payments.bookingId, bookingId), eq(payments.purpose, 'rent')))
    .orderBy(desc(payments.createdAt))
    .limit(1);

  if (!pay || pay.amountPaise < rent.rentPaise) return;

  await db
    .update(rentInvoices)
    .set({
      status: 'paid',
      paidPrincipalPaise: rent.rentPaise,
      paidLateFeePaise: 0,
      lateFeeLockedPaise: 0,
      paymentId: pay.id,
      paidAt: pay.paidAt,
      updatedAt: new Date(),
    })
    .where(eq(rentInvoices.id, rentInvoiceId));
}
