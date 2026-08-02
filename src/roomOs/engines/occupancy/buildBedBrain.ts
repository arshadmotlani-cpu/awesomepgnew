/**
 * Occupancy Engine — Bed Brain snapshot from ledger reads (Wave 1).
 * Delegates occupancy math to bedOccupancyEngine via bedOccupancyBatch SSOT.
 */

import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { bedReservations, bookings, beds, floors, rooms } from '@/src/db/schema';
import { resolveBedOccupancy } from '@/src/lib/bedOccupancyResolve';
import { todayString } from '@/src/lib/dates';
import { fetchBedOccupancyRows } from '@/src/services/bedOccupancyBatch';
import type { BedBrainSnapshot, BookingContextSlice } from '@/src/roomOs/types';

export function mapBedResidencyStatus(input: {
  isOccupiedForKpi: boolean;
  vacatingStatus?: 'pending' | 'approved' | null;
}): BookingContextSlice['residencyStatus'] {
  if (!input.isOccupiedForKpi) return 'none';
  if (input.vacatingStatus === 'pending' || input.vacatingStatus === 'approved') {
    return 'vacating';
  }
  return 'active';
}

async function loadActiveBookingForBed(
  bedId: string,
  asOfDate: string,
): Promise<{ bookingId: string; pgId: string } | null> {
  const [row] = await db
    .select({
      bookingId: bookings.id,
      pgId: floors.pgId,
    })
    .from(bedReservations)
    .innerJoin(bookings, eq(bookings.id, bedReservations.bookingId))
    .innerJoin(beds, eq(beds.id, bedReservations.bedId))
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .where(
      and(
        eq(bedReservations.bedId, bedId),
        eq(bedReservations.kind, 'primary'),
        eq(bedReservations.status, 'active'),
        eq(bookings.status, 'confirmed'),
        sql`${asOfDate}::date <@ ${bedReservations.stayRange}`,
      ),
    )
    .limit(1);

  if (!row?.bookingId || !row.pgId) return null;
  return { bookingId: row.bookingId, pgId: row.pgId };
}

/** Live-read Bed Brain (truth L1 → L3 on demand). Materialized cache follows in Wave 1 projectors. */
export async function buildBedBrainSnapshot(input: {
  bedId: string;
  asOf?: string;
}): Promise<BedBrainSnapshot | null> {
  const asOf = input.asOf ?? todayString();
  const rows = await fetchBedOccupancyRows({ bedId: input.bedId, asOfDate: asOf });
  const facts = rows[0];
  if (!facts?.roomId || !facts.pgId) return null;

  const resolved = resolveBedOccupancy(facts);
  const activeBooking = resolved.isOccupiedForKpi
    ? await loadActiveBookingForBed(input.bedId, asOf)
    : null;

  const bookingContext: BookingContextSlice | null = activeBooking
    ? {
        bookingId: activeBooking.bookingId,
        bedId: input.bedId,
        pgId: activeBooking.pgId,
        residencyStatus: mapBedResidencyStatus({
          isOccupiedForKpi: resolved.isOccupiedForKpi,
          vacatingStatus: facts.vacatingStatus,
        }),
        derivationRefs: [
          {
            stepId: 'occupancy.resolve',
            engine: 'Occupancy',
            inputDigest: `bed:${input.bedId}:asOf:${asOf}`,
            outputDigest: resolved.snapshot.publicState,
          },
        ],
      }
    : null;

  return {
    bedId: input.bedId,
    roomId: facts.roomId,
    pgId: facts.pgId,
    asOf,
    bookingContext,
    computedAt: new Date().toISOString(),
    snapshotVersion: 1,
  };
}
