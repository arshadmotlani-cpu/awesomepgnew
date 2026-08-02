/**
 * Read-only PG resolution helpers for integrity checks.
 */

import { eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { bedReservations, beds, bookings, floors, pgs, rooms } from '@/src/db/schema';

export async function resolvePgIdForRoom(roomId: string): Promise<string | null> {
  const [row] = await db
    .select({ pgId: floors.pgId })
    .from(rooms)
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .where(eq(rooms.id, roomId))
    .limit(1);
  return row?.pgId ?? null;
}

export async function resolvePgIdForBooking(bookingId: string): Promise<string | null> {
  const [row] = await db
    .select({ pgId: floors.pgId })
    .from(bedReservations)
    .innerJoin(beds, eq(beds.id, bedReservations.bedId))
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .where(eq(bedReservations.bookingId, bookingId))
    .limit(1);
  return row?.pgId ?? null;
}

export async function pgExists(pgId: string): Promise<boolean> {
  const [row] = await db.select({ id: pgs.id }).from(pgs).where(eq(pgs.id, pgId)).limit(1);
  return Boolean(row);
}

export async function bookingBelongsToPg(bookingId: string, pgId: string): Promise<boolean> {
  const resolved = await resolvePgIdForBooking(bookingId);
  return resolved === pgId;
}

export async function loadBookingCustomerId(bookingId: string): Promise<string | null> {
  const [row] = await db
    .select({ customerId: bookings.customerId })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);
  return row?.customerId ?? null;
}
