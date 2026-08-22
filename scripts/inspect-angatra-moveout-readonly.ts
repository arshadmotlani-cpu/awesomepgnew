/* eslint-disable no-console */
/**
 * Read-only production inspection — Angatra Mandal move-out / vacating state.
 *
 *   npx tsx scripts/inspect-angatra-moveout-readonly.ts
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.prod.live' });
dotenv.config({ path: '.env.production.local' });

import { and, desc, eq, sql } from 'drizzle-orm';
import { closeDb, db } from '@/src/db/client';
import {
  auditLog,
  bedReservations,
  beds,
  bookings,
  checkoutSettlements,
  customers,
  depositLedger,
  electricityInvoices,
  rentInvoices,
  rooms,
  vacatingRequests,
} from '@/src/db/schema';
import { resolveMonthlyRentPaiseForBooking } from '@/src/lib/billing/rentPricingSsot';
import { firstOfMonth } from '@/src/services/billing';
import { getDepositSummaryForBooking } from '@/src/services/deposits';
import { getBookingFinancialAccount } from '@/src/services/residentFinancialEngine';
import { listRecentCreditEntries } from '@/src/services/residentCreditLedger';
import { buildVacatingApprovalPreviewAsync } from '@/src/lib/vacating/approvalPreview';
import { _internals, projectInvoice } from '@/src/services/rentInvoices';

const BOOKING_ID = 'ad24c0d2-f2d1-4c08-99d1-74487560feb5';
const BOOKING_CODE = 'APG-2026-0013';
const PG_ID = '64ead929-b7a0-43a6-8ac4-cafdd398ecde';

async function main() {
  const [booking] = await db.select().from(bookings).where(eq(bookings.id, BOOKING_ID)).limit(1);
  if (!booking) throw new Error('Booking not found');

  const [customer] = await db.select().from(customers).where(eq(customers.id, booking.customerId)).limit(1);

  const [bedMeta] = await db
    .select({ roomNumber: rooms.roomNumber, bedCode: beds.bedCode })
    .from(bedReservations)
    .innerJoin(beds, eq(beds.id, bedReservations.bedId))
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .where(and(eq(bedReservations.bookingId, BOOKING_ID), eq(bedReservations.kind, 'primary')))
    .limit(1);

  const vacating = await db
    .select()
    .from(vacatingRequests)
    .where(eq(vacatingRequests.bookingId, BOOKING_ID))
    .orderBy(desc(vacatingRequests.createdAt));

  const vacatingAudit = await db
    .select({
      entityId: auditLog.entityId,
      action: auditLog.action,
      createdAt: auditLog.createdAt,
      diff: auditLog.diff,
    })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.entity, 'vacating_request'),
        sql`diff->>'bookingId' = ${BOOKING_ID}`,
      ),
    )
    .orderBy(auditLog.createdAt);

  const settlements = await db
    .select()
    .from(checkoutSettlements)
    .where(eq(checkoutSettlements.bookingId, BOOKING_ID))
    .orderBy(desc(checkoutSettlements.updatedAt));

  const rents = await db
    .select()
    .from(rentInvoices)
    .where(and(eq(rentInvoices.bookingId, BOOKING_ID), sql`status <> 'cancelled'`))
    .orderBy(desc(rentInvoices.billingMonth));

  const elecs = await db
    .select()
    .from(electricityInvoices)
    .where(and(eq(electricityInvoices.bookingId, BOOKING_ID), sql`status <> 'cancelled'`))
    .orderBy(desc(electricityInvoices.billingMonth));

  const depositRows = await db
    .select()
    .from(depositLedger)
    .where(eq(depositLedger.bookingId, BOOKING_ID))
    .orderBy(depositLedger.createdAt);

  const stay = await _internals.loadStayWindow(BOOKING_ID);
  const billingMonth = firstOfMonth(new Date().toISOString().slice(0, 10));
  const { rentPaise: monthlyRent } = await resolveMonthlyRentPaiseForBooking(BOOKING_ID, billingMonth);

  const depositSummary = await getDepositSummaryForBooking(BOOKING_ID);
  const wallet = customer ? await listRecentCreditEntries(customer.id, 50) : [];
  const acct = await getBookingFinancialAccount({
    bookingId: BOOKING_ID,
    customerId: booking.customerId,
    customerName: customer?.fullName ?? '',
    customerPhone: customer?.phone ?? '',
    bookingCode: BOOKING_CODE,
    pgId: PG_ID,
    pgName: 'Shantinagar',
    roomNumber: bedMeta?.roomNumber ?? '?',
    depositPaise: booking.depositPaise,
    depositDuePaise: booking.depositDuePaise,
  });

  console.log('\n=== ANGATRA MANDAL — READ-ONLY PRODUCTION INSPECTION ===\n');
  console.log('Resident:', customer?.fullName, customer?.phone);
  console.log('Booking:', BOOKING_CODE, BOOKING_ID);
  console.log('Room:', bedMeta ? `R${bedMeta.roomNumber} · ${bedMeta.bedCode}` : '—');
  console.log('Booking status:', booking.status);
  console.log('Stay window:', stay);
  console.log('Monthly rent SSOT (paise):', monthlyRent);

  console.log('\n--- Vacating audit trail ---');
  if (vacatingAudit.length === 0) {
    console.log('(none)');
  } else {
    for (const a of vacatingAudit) {
      console.log({
        action: a.action,
        entityId: a.entityId,
        createdAt: a.createdAt,
        diff: a.diff,
      });
    }
  }

  console.log('\n--- Vacating requests (current rows) ---');
  if (vacating.length === 0) {
    console.log('(none — row was deleted after accidental cancel on 2026-08-20)');
  } else {
    for (const v of vacating) {
      console.log(JSON.stringify(v, null, 2));
    }
  }

  console.log('\n--- Checkout settlements ---');
  if (settlements.length === 0) {
    console.log('(none)');
  } else {
    for (const s of settlements) {
      console.log(JSON.stringify(s, null, 2));
    }
  }

  console.log('\n--- Rent invoices ---');
  for (const r of rents) {
    const p = projectInvoice(r);
    console.log({
      invoiceNumber: r.invoiceNumber,
      billingMonth: r.billingMonth,
      rentPaise: r.rentPaise,
      status: r.status,
      paidAt: r.paidAt,
      outstandingPaise: p.outstandingPaise,
      notes: r.notes,
    });
  }

  console.log('\n--- Electricity invoices ---');
  for (const e of elecs) {
    console.log({
      invoiceNumber: e.invoiceNumber,
      billingMonth: e.billingMonth,
      amountPaise: e.amountPaise,
      paidPaise: e.paidPaise,
      status: e.status,
    });
  }

  console.log('\n--- Deposit ledger ---');
  for (const d of depositRows) {
    console.log({
      entryKind: d.entryKind,
      amountPaise: d.amountPaise,
      reason: d.reason,
      createdAt: d.createdAt,
      relatedVacatingId: d.relatedVacatingId,
    });
  }

  console.log('\n--- Deposit summary ---');
  console.log(depositSummary);

  console.log('\n--- Wallet / credit ledger ---');
  console.log(wallet);

  console.log('\n--- Financial account ---');
  console.log({
    rentOutstanding: acct.rent.outstandingPaise,
    elecOutstanding: acct.electricity.outstandingPaise,
    depositOutstanding: acct.deposit.outstandingPaise,
    depositRefundable: acct.deposit.refundablePaise,
  });

  const activeVacating = vacating.find((v) => v.status === 'pending' || v.status === 'approved');
  if (activeVacating && bedMeta) {
    const preview = await buildVacatingApprovalPreviewAsync(
      {
        id: activeVacating.id,
        bookingId: BOOKING_ID,
        customerFullName: customer?.fullName ?? 'Angatra Mandal',
        customerPhone: customer?.phone ?? '',
        bookingCode: BOOKING_CODE,
        pgName: 'Shantinagar',
        roomNumber: bedMeta.roomNumber,
        bedCode: bedMeta.bedCode,
        noticeGivenDate: String(activeVacating.noticeGivenDate),
        vacatingDate: String(activeVacating.vacatingDate),
        originalNoticeSubmittedAt: activeVacating.originalNoticeSubmittedAt,
        deductionPaise: activeVacating.deductionPaise,
        monthlyRentPaiseSnapshot: activeVacating.monthlyRentPaiseSnapshot,
        noticeRentCoveredDays: activeVacating.noticeRentCoveredDays,
        noticeChargeableDays: activeVacating.noticeChargeableDays,
        noticeBreakdownJson: activeVacating.noticeBreakdownJson,
        status: activeVacating.status,
        resolvedAt: activeVacating.resolvedAt,
        updatedAt: activeVacating.updatedAt,
      },
      depositSummary.heldPaise,
    );
    console.log('\n--- Settlement preview (SSOT notice date) ---');
    console.log(JSON.stringify(preview, null, 2));
  } else {
    console.log('\n--- Settlement preview ---');
    console.log('(skipped — no active vacating row; repair script required)');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => closeDb());
