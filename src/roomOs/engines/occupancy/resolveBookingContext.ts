/**
 * BookingContext resolution — Wave 3 RFE via Bed Brain entry point.
 * Resolves bookingId → primary bed → Bed Brain → LedgerProjection pointers.
 */

import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { bedReservations, beds, bookings, checkoutSettlements, floors, rooms } from '@/src/db/schema';
import { buildBedBrainSnapshot } from '@/src/roomOs/engines/occupancy/buildBedBrain';
import { buildBookingLedgerSnapshot } from '@/src/roomOs/engines/ledger';
import type {
  BedBrainSnapshot,
  BookingContextSlice,
  BookingLedgerSnapshot,
} from '@/src/roomOs/types';
import { todayString } from '@/src/lib/dates';

export type BookingContextSnapshot = {
  bookingId: string;
  bedId: string;
  roomId: string;
  pgId: string;
  asOf: string;
  bookingContext: BookingContextSlice;
  bedBrain: BedBrainSnapshot;
  ledger: BookingLedgerSnapshot | null;
  computedAt: string;
  snapshotVersion: number;
};

async function resolvePrimaryBedForBooking(bookingId: string): Promise<{
  bedId: string;
  roomId: string;
  pgId: string;
} | null> {
  const [row] = await db
    .select({
      bedId: beds.id,
      roomId: rooms.id,
      pgId: floors.pgId,
    })
    .from(bedReservations)
    .innerJoin(beds, eq(beds.id, bedReservations.bedId))
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .where(and(eq(bedReservations.bookingId, bookingId), eq(bedReservations.kind, 'primary')))
    .orderBy(desc(bedReservations.createdAt))
    .limit(1);

  if (!row?.bedId || !row.roomId || !row.pgId) return null;
  return { bedId: row.bedId, roomId: row.roomId, pgId: row.pgId };
}

async function loadOpenCheckoutSettlementId(bookingId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: checkoutSettlements.id })
    .from(checkoutSettlements)
    .where(
      and(
        eq(checkoutSettlements.bookingId, bookingId),
        sql`${checkoutSettlements.status} <> 'archived'`,
      ),
    )
    .orderBy(desc(checkoutSettlements.updatedAt))
    .limit(1);
  return row?.id ?? null;
}

function enrichBookingContextPointers(input: {
  base: BookingContextSlice;
  ledger: BookingLedgerSnapshot | null;
  moveOutPointer: string | null;
}): BookingContextSlice {
  const rentPointer =
    input.ledger && input.ledger.rent.outstandingPaise > 0
      ? `ledger:rent:${input.ledger.bookingId}`
      : undefined;
  const depositPointer =
    input.ledger && input.ledger.deposit.outstandingPaise > 0
      ? `ledger:deposit:${input.ledger.bookingId}`
      : undefined;

  return {
    ...input.base,
    rentInvoicePointer: rentPointer,
    depositPointer,
    moveOutPointer: input.moveOutPointer ?? undefined,
    derivationRefs: [
      ...input.base.derivationRefs,
      ...(input.ledger
        ? [
            {
              stepId: 'booking_context.ledger_bridge',
              engine: 'LedgerProjection',
              inputDigest: `booking:${input.base.bookingId}`,
              outputDigest: `outstanding:${input.ledger.totals.outstandingPaise}`,
            },
          ]
        : []),
    ],
  };
}

/** Resolve booking-scoped context via Bed Brain + LedgerProjection (Wave 3). */
export async function buildBookingContextSnapshot(input: {
  bookingId: string;
  asOf?: string;
}): Promise<BookingContextSnapshot | null> {
  const asOf = input.asOf ?? todayString();
  const bedLocation = await resolvePrimaryBedForBooking(input.bookingId);
  if (!bedLocation) return null;

  const [bedBrain, ledger, moveOutPointer] = await Promise.all([
    buildBedBrainSnapshot({ bedId: bedLocation.bedId, asOf }),
    buildBookingLedgerSnapshot({ bookingId: input.bookingId, asOf }),
    loadOpenCheckoutSettlementId(input.bookingId),
  ]);

  if (!bedBrain) return null;

  const baseContext: BookingContextSlice = bedBrain.bookingContext ?? {
    bookingId: input.bookingId,
    bedId: bedLocation.bedId,
    pgId: bedLocation.pgId,
    residencyStatus: 'none',
    derivationRefs: [
      {
        stepId: 'booking_context.fallback',
        engine: 'Occupancy',
        inputDigest: `booking:${input.bookingId}`,
        outputDigest: 'no_active_context',
      },
    ],
  };

  const bookingContext = enrichBookingContextPointers({
    base: {
      ...baseContext,
      bookingId: input.bookingId,
      bedId: bedLocation.bedId,
      pgId: bedLocation.pgId,
    },
    ledger,
    moveOutPointer,
  });

  return {
    bookingId: input.bookingId,
    bedId: bedLocation.bedId,
    roomId: bedLocation.roomId,
    pgId: bedLocation.pgId,
    asOf,
    bookingContext,
    bedBrain,
    ledger,
    computedAt: new Date().toISOString(),
    snapshotVersion: 1,
  };
}
