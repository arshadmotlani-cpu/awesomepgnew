/**
 * Outstanding balance from prior stays — included in new booking checkout totals.
 * Read-only aggregation; does not mutate ledger rows.
 */

import { and, eq, inArray, ne } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { bedReservations, beds, bookings, customers, floors, pgs, rooms } from '@/src/db/schema';
import type { PricingSnapshot } from '@/src/db/schema/bookings';
import type { PriorOutstandingBalance, PriorOutstandingItem } from '@/src/lib/billing/bookingCheckoutTotals';
import {
  COLLECTIBLE_PRIOR_BOOKING_STATUSES,
  COLLECTIBLE_PRIOR_RESERVATION_STATUSES,
  isCollectiblePriorBookingStatus,
  isCollectiblePriorReservationStatus,
} from '@/src/lib/billing/priorOutstandingEligibility';
import { getBookingFinancialSummary } from '@/src/services/residentFinancialEngine';

function sumPriorOutstandingItems(items: PriorOutstandingItem[]): number {
  return items.reduce((sum, item) => sum + item.amountPaise, 0);
}

/** Drop stale snapshot lines whose source booking is no longer collectible. */
export async function filterCollectiblePriorOutstandingItems(
  items: PriorOutstandingItem[],
): Promise<PriorOutstandingItem[]> {
  const bookingIds = [...new Set(items.map((item) => item.bookingId).filter(Boolean))] as string[];
  if (bookingIds.length === 0) return [];

  const rows = await db
    .select({
      bookingId: bookings.id,
      bookingStatus: bookings.status,
      reservationStatus: bedReservations.status,
    })
    .from(bookings)
    .innerJoin(
      bedReservations,
      and(eq(bedReservations.bookingId, bookings.id), eq(bedReservations.kind, 'primary')),
    )
    .where(inArray(bookings.id, bookingIds));

  const eligible = new Set<string>();
  for (const row of rows) {
    if (
      isCollectiblePriorBookingStatus(row.bookingStatus) &&
      isCollectiblePriorReservationStatus(row.reservationStatus)
    ) {
      eligible.add(row.bookingId);
    }
  }

  return items.filter((item) => item.bookingId && eligible.has(item.bookingId));
}

/** Live prior-outstanding balance — never trust pricing snapshots for display or payment validation. */
export async function resolveLivePriorOutstandingForCheckout(
  customerId: string,
  excludeBookingId?: string,
): Promise<PriorOutstandingBalance> {
  return getCustomerPriorOutstandingForCheckout(customerId, excludeBookingId);
}

/** Inject live prior outstanding into a booking row used for checkout payment math. */
export function bookingRowWithLivePriorOutstanding<
  T extends { pricingSnapshot?: PricingSnapshot | null },
>(booking: T, priorOutstanding: PriorOutstandingBalance): T {
  const snapshot = { ...(booking.pricingSnapshot ?? {}) } as PricingSnapshot;
  if (priorOutstanding.totalPaise > 0) {
    snapshot.priorOutstanding = priorOutstanding;
  } else {
    delete snapshot.priorOutstanding;
  }
  return { ...booking, pricingSnapshot: snapshot };
}

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
    .innerJoin(bedReservations, and(eq(bedReservations.bookingId, bookings.id), eq(bedReservations.kind, 'primary')))
    .innerJoin(beds, eq(beds.id, bedReservations.bedId))
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .innerJoin(pgs, eq(pgs.id, floors.pgId))
    .where(
      and(
        eq(bookings.customerId, customerId),
        inArray(bookings.status, [...COLLECTIBLE_PRIOR_BOOKING_STATUSES]),
        inArray(bedReservations.status, [...COLLECTIBLE_PRIOR_RESERVATION_STATUSES]),
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

  const filtered = await filterCollectiblePriorOutstandingItems(items);
  const totalPaise = sumPriorOutstandingItems(filtered);
  return { totalPaise, items: filtered };
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
