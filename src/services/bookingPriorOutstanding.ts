/**
 * Outstanding balance from prior stays — included in new booking checkout totals.
 * Read-only aggregation; does not mutate ledger rows.
 */

import { and, eq, inArray, ne } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { bedReservations, beds, bookings, customers, floors, pgs, rooms } from '@/src/db/schema';
import type { PriorOutstandingBalance, PriorOutstandingItem } from '@/src/lib/billing/bookingCheckoutTotals';
import { getBookingFinancialSummary } from '@/src/services/residentFinancialEngine';

const PRIOR_BOOKING_STATUSES = ['confirmed', 'completed', 'pending_payment'] as const;

export async function getCustomerPriorOutstandingForCheckout(
  customerId: string,
  excludeBookingId?: string,
): Promise<PriorOutstandingBalance> {
  const bookingRows = await db
    .select({
      bookingId: bookings.id,
      bookingCode: bookings.bookingCode,
      depositPaise: bookings.depositPaise,
      depositDuePaise: bookings.depositDuePaise,
      customerName: customers.fullName,
      customerPhone: customers.phone,
      pgId: pgs.id,
      pgName: pgs.name,
      roomNumber: rooms.roomNumber,
    })
    .from(bookings)
    .innerJoin(customers, eq(customers.id, bookings.customerId))
    .innerJoin(bedReservations, eq(bedReservations.bookingId, bookings.id))
    .innerJoin(beds, eq(beds.id, bedReservations.bedId))
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .innerJoin(pgs, eq(pgs.id, floors.pgId))
    .where(
      and(
        eq(bookings.customerId, customerId),
        inArray(bookings.status, [...PRIOR_BOOKING_STATUSES]),
        excludeBookingId ? ne(bookings.id, excludeBookingId) : undefined,
      ),
    );

  const seen = new Set<string>();
  const items: PriorOutstandingItem[] = [];

  for (const row of bookingRows) {
    if (seen.has(row.bookingId)) continue;
    seen.add(row.bookingId);

    const summary = await getBookingFinancialSummary({
      bookingId: row.bookingId,
      customerId,
      customerName: row.customerName,
      customerPhone: row.customerPhone,
      bookingCode: row.bookingCode,
      pgId: row.pgId,
      pgName: row.pgName,
      roomNumber: row.roomNumber,
      depositPaise: row.depositPaise,
      depositDuePaise: row.depositDuePaise,
    });

    for (const line of summary.deposit.items) {
      if (line.outstandingPaise <= 0) continue;
      items.push({
        label: line.label,
        amountPaise: line.outstandingPaise,
        bookingId: row.bookingId,
        bookingCode: row.bookingCode,
        kind: 'deposit',
      });
    }

    for (const line of summary.rent.items) {
      if (line.outstandingPaise <= 0) continue;
      items.push({
        label: line.label,
        amountPaise: line.outstandingPaise,
        bookingId: row.bookingId,
        bookingCode: row.bookingCode,
        kind: 'rent',
      });
    }

    for (const line of summary.electricity.items) {
      if (line.outstandingPaise <= 0) continue;
      items.push({
        label: line.label,
        amountPaise: line.outstandingPaise,
        bookingId: row.bookingId,
        bookingCode: row.bookingCode,
        kind: 'electricity',
      });
    }

    for (const line of summary.other.items) {
      if (line.outstandingPaise <= 0) continue;
      items.push({
        label: line.label,
        amountPaise: line.outstandingPaise,
        bookingId: row.bookingId,
        bookingCode: row.bookingCode,
        kind: 'other',
      });
    }
  }

  const totalPaise = items.reduce((sum, item) => sum + item.amountPaise, 0);
  return { totalPaise, items };
}

/** Allocate checkout payment remainder to prior deposit balances (append-only ledger). */
export async function applyPriorOutstandingFromCheckoutPayment(input: {
  customerId: string;
  priorOutstanding: PriorOutstandingBalance;
  amountPaise: number;
  relatedPaymentId: string;
}): Promise<void> {
  if (input.amountPaise <= 0 || input.priorOutstanding.totalPaise <= 0) return;

  const { recordDepositCollected } = await import('@/src/services/deposits');
  let remaining = input.amountPaise;

  for (const item of input.priorOutstanding.items) {
    if (remaining <= 0) break;
    if (item.kind !== 'deposit' || !item.bookingId) continue;
    const slice = Math.min(remaining, item.amountPaise);
    if (slice <= 0) continue;
    await recordDepositCollected({
      bookingId: item.bookingId,
      customerId: input.customerId,
      amountPaise: slice,
      reason: 'Prior stay balance collected with new booking checkout',
      relatedPaymentId: input.relatedPaymentId,
    });
    remaining -= slice;
  }
}
