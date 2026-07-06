/**
 * Inventory blocking SSOT — single gate for bed availability checks.
 */

import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { bedReservations, beds, bookings } from '@/src/db/schema';
import {
  BLOCKING_BOOKING_STATUSES_SQL,
  BLOCKING_RESERVATION_STATUS_SQL,
} from '@/src/lib/reservationBlocking';
import { formatDate, parseDate, type DateLike } from '@/src/lib/dates';

export type BedBlockReason =
  | 'none'
  | 'under_review'
  | 'reserved_incoming'
  | 'transfer_hold'
  | 'occupied'
  | 'bed_reserve'
  | 'maintenance'
  | 'blocked';

export type BedBlocksInventoryInput = {
  bedId: string;
  startDate: DateLike;
  endDate?: DateLike | null;
  /** Skip room-transfer hold check (internal recursion guard). */
  skipTransferHoldCheck?: boolean;
};

/**
 * Returns true when the bed cannot accept a new reservation/booking for the date range.
 */
export async function bedBlocksInventory(input: BedBlocksInventoryInput): Promise<boolean> {
  const start = formatDate(parseDate(input.startDate));

  const [bed] = await db
    .select({ status: beds.status, archivedAt: beds.archivedAt })
    .from(beds)
    .where(eq(beds.id, input.bedId))
    .limit(1);
  if (!bed || bed.archivedAt) return true;
  if (bed.status === 'maintenance' || bed.status === 'blocked') return true;

  const rangeOverlap =
    input.endDate == null
      ? sql`${bedReservations.stayRange} && daterange(${start}::date, NULL, '[)')`
      : sql`${bedReservations.stayRange} && daterange(${start}::date, ${formatDate(parseDate(input.endDate))}::date, '[)')`;

  const [reservationConflict] = await db
    .select({ id: bedReservations.id })
    .from(bedReservations)
    .innerJoin(bookings, eq(bookings.id, bedReservations.bookingId))
    .where(
      and(
        eq(bedReservations.bedId, input.bedId),
        sql`${bedReservations.status} IN ${sql.raw(BLOCKING_RESERVATION_STATUS_SQL)}`,
        sql`${bookings.status} IN ${sql.raw(BLOCKING_BOOKING_STATUSES_SQL)}`,
        eq(bedReservations.kind, 'primary'),
        rangeOverlap,
      ),
    )
    .limit(1);
  if (reservationConflict) return true;

  if (!input.skipTransferHoldCheck) {
    const { bedHasActiveRoomTransferHold } = await import(
      '@/src/lib/roomTransfer/transferAvailability'
    );
    if (await bedHasActiveRoomTransferHold(input.bedId)) return true;
  }

  const { getInventoryBlockingReserveForBed } = await import('@/src/services/bedReserve');
  const blockingReserve = await getInventoryBlockingReserveForBed(input.bedId);
  if (blockingReserve) {
    const reserveStart = blockingReserve.reserveStart;
    const reserveEnd = blockingReserve.checkInDate;
    if (input.endDate == null) {
      if (start < reserveEnd) return true;
    } else {
      const end = formatDate(parseDate(input.endDate));
      if (start < reserveEnd && end > reserveStart) return true;
    }
  }

  return false;
}

/** Inverse of bedBlocksInventory for booking funnel. */
export async function isBedInventoryAvailable(input: BedBlocksInventoryInput): Promise<boolean> {
  return !(await bedBlocksInventory(input));
}
