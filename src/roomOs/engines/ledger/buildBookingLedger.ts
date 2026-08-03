/**
 * LedgerProjection — booking-scoped financial snapshot from ledger reads (Wave 1).
 * Delegates money math to residentFinancialEngine SSOT — no duplicate formulas.
 */

import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  bedReservations,
  beds,
  bookings,
  checkoutSettlements,
  customers,
  floors,
  pgs,
  rooms,
} from '@/src/db/schema';
import { todayString } from '@/src/lib/dates';
import { countBookingPendingPaymentProofs } from '@/src/roomOs/engines/ledger/countBookingPendingProofs';
import {
  mapLedgerCategorySlice,
  resolvePaymentState,
} from '@/src/roomOs/engines/ledger/resolveBookingLedgerFacts';
import type { BookingLedgerSnapshot } from '@/src/roomOs/types';
import { computeBookingFinancialSummaryCore } from '@/src/services/residentFinancialEngine';

async function loadBookingLedgerContext(bookingId: string) {
  const [row] = await db
    .select({
      bookingId: bookings.id,
      bookingCode: bookings.bookingCode,
      bookingStatus: bookings.status,
      customerId: bookings.customerId,
      customerName: customers.fullName,
      customerPhone: customers.phone,
      depositPaise: bookings.depositPaise,
      depositDuePaise: bookings.depositDuePaise,
      pgId: pgs.id,
      pgName: pgs.name,
      roomNumber: rooms.roomNumber,
    })
    .from(bookings)
    .innerJoin(customers, eq(customers.id, bookings.customerId))
    .innerJoin(
      bedReservations,
      and(eq(bedReservations.bookingId, bookings.id), eq(bedReservations.kind, 'primary')),
    )
    .innerJoin(beds, eq(beds.id, bedReservations.bedId))
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .innerJoin(pgs, eq(pgs.id, floors.pgId))
    .where(eq(bookings.id, bookingId))
    .limit(1);

  return row ?? null;
}

async function loadOpenCheckoutSettlementStatus(bookingId: string): Promise<string | null> {
  const [row] = await db
    .select({ status: checkoutSettlements.status })
    .from(checkoutSettlements)
    .where(
      and(
        eq(checkoutSettlements.bookingId, bookingId),
        sql`${checkoutSettlements.status} <> 'archived'`,
      ),
    )
    .orderBy(desc(checkoutSettlements.updatedAt))
    .limit(1);
  return row?.status ?? null;
}

/** Live-read booking ledger (truth L1 → L3 on demand). Materialized cache follows via LedgerProjectionProjector. */
export async function buildBookingLedgerSnapshot(input: {
  bookingId: string;
  asOf?: string;
}): Promise<BookingLedgerSnapshot | null> {
  const asOf = input.asOf ?? todayString();
  const context = await loadBookingLedgerContext(input.bookingId);
  if (!context) return null;

  const [summary, pendingProofCount, checkoutSettlementStatus] = await Promise.all([
    computeBookingFinancialSummaryCore({
      bookingId: context.bookingId,
      customerId: context.customerId,
      customerName: context.customerName,
      customerPhone: context.customerPhone ?? '',
      bookingCode: context.bookingCode,
      pgId: context.pgId,
      pgName: context.pgName,
      roomNumber: context.roomNumber,
      depositPaise: context.depositPaise,
      depositDuePaise: context.depositDuePaise,
    }),
    countBookingPendingPaymentProofs(context.bookingId),
    loadOpenCheckoutSettlementStatus(context.bookingId),
  ]);

  const rent = mapLedgerCategorySlice(summary.rent);
  const electricity = mapLedgerCategorySlice(summary.electricity);
  const deposit = {
    ...mapLedgerCategorySlice(summary.deposit),
    refundablePaise: summary.deposit.refundablePaise,
  };

  const payment = resolvePaymentState({
    bookingStatus: context.bookingStatus,
    pendingProofCount,
    checkoutSettlementStatus,
  });

  return {
    bookingId: context.bookingId,
    bookingCode: context.bookingCode,
    pgId: context.pgId,
    customerId: context.customerId,
    asOf,
    rent,
    electricity,
    deposit,
    totals: {
      requiredPaise: summary.totals.requiredPaise,
      receivedPaise: summary.totals.paidPaise,
      outstandingPaise: summary.totals.outstandingPaise,
    },
    paymentState: payment.state,
    paymentStateReason: payment.reason,
    checkoutSettlementStatus,
    computedAt: new Date().toISOString(),
    snapshotVersion: 1,
    derivationRefs: [
      {
        stepId: 'ledger.financial_summary',
        engine: 'LedgerProjection',
        inputDigest: `booking:${context.bookingId}`,
        outputDigest: `outstanding:${summary.totals.outstandingPaise}`,
      },
      {
        stepId: 'ledger.payment_state',
        engine: 'LedgerProjection',
        inputDigest: `proofs:${pendingProofCount}:checkout:${checkoutSettlementStatus ?? 'none'}`,
        outputDigest: payment.state,
      },
    ],
  };
}
