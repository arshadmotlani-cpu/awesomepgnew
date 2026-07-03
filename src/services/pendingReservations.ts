/**
 * Temporary bed reservations — visible to admin before payment proof upload.
 */
import { and, eq, gt, isNull, notExists, or, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  bedReservations,
  beds,
  bookings,
  customers,
  floors,
  pgPaymentRecords,
  pgs,
  rooms,
} from '@/src/db/schema';
import type { AdminSession } from '@/src/lib/auth/session';
import { adminCanAccessPg } from '@/src/lib/auth/roles';

export type PendingReservationRow = {
  bookingId: string;
  bookingCode: string;
  customerName: string;
  pgId: string;
  pgName: string;
  roomNumber: string | null;
  bedCode: string | null;
  holdExpiresAt: Date | null;
  totalPaise: number;
  createdAt: Date;
};

export async function listPendingReservations(
  session: AdminSession,
): Promise<PendingReservationRow[]> {
  const now = new Date();

  const rows = await db
    .select({
      bookingId: bookings.id,
      bookingCode: bookings.bookingCode,
      customerName: customers.fullName,
      pgId: floors.pgId,
      pgName: pgs.name,
      roomNumber: rooms.roomNumber,
      bedCode: beds.bedCode,
      holdExpiresAt: bedReservations.holdExpiresAt,
      totalPaise: bookings.totalPaise,
      createdAt: bookings.createdAt,
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
        eq(bookings.status, 'pending_payment'),
        eq(bedReservations.status, 'hold'),
        eq(bedReservations.kind, 'primary'),
        or(isNull(bedReservations.holdExpiresAt), gt(bedReservations.holdExpiresAt, now)),
        notExists(
          db
            .select({ id: pgPaymentRecords.id })
            .from(pgPaymentRecords)
            .where(
              and(
                eq(pgPaymentRecords.bookingId, bookings.id),
                eq(pgPaymentRecords.status, 'pending'),
              ),
            ),
        ),
      ),
    )
    .orderBy(sql`${bedReservations.holdExpiresAt} ASC NULLS LAST`);

  const byBooking = new Map<string, PendingReservationRow>();
  for (const row of rows) {
    if (!row.pgId || byBooking.has(row.bookingId)) continue;
    if (!adminCanAccessPg({ role: session.role, pgScope: session.pgScope }, row.pgId)) continue;
    byBooking.set(row.bookingId, {
      bookingId: row.bookingId,
      bookingCode: row.bookingCode,
      customerName: row.customerName,
      pgId: row.pgId,
      pgName: row.pgName,
      roomNumber: row.roomNumber,
      bedCode: row.bedCode,
      holdExpiresAt: row.holdExpiresAt,
      totalPaise: row.totalPaise,
      createdAt: row.createdAt,
    });
  }

  return [...byBooking.values()];
}

export async function countPendingReservations(session: AdminSession): Promise<number> {
  const rows = await listPendingReservations(session);
  return rows.length;
}
