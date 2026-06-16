/**
 * Bed reconciliation — detect ghost occupancy, double assignments, missing assignments.
 */

import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  auditLog,
  bedReservations,
  beds,
  bookings,
  customers,
  floors,
  pgs,
  rooms,
} from '@/src/db/schema';
import { clearBedAdminMarks } from '@/src/services/bookingAdminOps';
import { formatDate } from '@/src/lib/dates';

export type BedAuditIssue = {
  kind: 'ghost_occupied' | 'double_assignment' | 'missing_assignment';
  bedId: string;
  bedCode: string;
  roomNumber: string;
  pgName: string;
  pgId: string;
  detail: string;
  bookingId?: string;
  customerId?: string;
  customerName?: string;
};

export type BedAuditReport = {
  asOf: string;
  issues: BedAuditIssue[];
  bedsChecked: number;
};

export async function runBedAudit(): Promise<BedAuditReport> {
  const today = formatDate(new Date());
  const issues: BedAuditIssue[] = [];

  const bedsRows = await db
    .select({
      bedId: beds.id,
      bedCode: beds.bedCode,
      manualOccupied: beds.manualOccupied,
      roomNumber: rooms.roomNumber,
      pgId: pgs.id,
      pgName: pgs.name,
    })
    .from(beds)
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .innerJoin(pgs, eq(pgs.id, floors.pgId))
    .where(sql`${beds.archivedAt} IS NULL`);

  for (const bed of bedsRows) {
    const activeReservations = await db
      .select({
        reservationId: bedReservations.id,
        bookingId: bedReservations.bookingId,
        customerId: bookings.customerId,
        customerName: customers.fullName,
        bookingStatus: bookings.status,
      })
      .from(bedReservations)
      .innerJoin(bookings, eq(bookings.id, bedReservations.bookingId))
      .innerJoin(customers, eq(customers.id, bookings.customerId))
      .where(
        and(
          eq(bedReservations.bedId, bed.bedId),
          eq(bedReservations.status, 'active'),
          eq(bedReservations.kind, 'primary'),
          sql`${today}::date <@ ${bedReservations.stayRange}`,
        ),
      );

    const confirmed = activeReservations.filter((r) => r.bookingStatus === 'confirmed');

    if (bed.manualOccupied && confirmed.length === 0) {
      issues.push({
        kind: 'ghost_occupied',
        bedId: bed.bedId,
        bedCode: bed.bedCode,
        roomNumber: bed.roomNumber,
        pgId: bed.pgId,
        pgName: bed.pgName,
        detail: 'Bed marked manually occupied but no active confirmed reservation.',
      });
    }

    if (confirmed.length > 1) {
      issues.push({
        kind: 'double_assignment',
        bedId: bed.bedId,
        bedCode: bed.bedCode,
        roomNumber: bed.roomNumber,
        pgId: bed.pgId,
        pgName: bed.pgName,
        detail: `${confirmed.length} active confirmed reservations overlap today.`,
        bookingId: confirmed[0]?.bookingId,
        customerId: confirmed[0]?.customerId,
        customerName: confirmed[0]?.customerName,
      });
    }

  }

  const confirmedWithoutBed = await db.execute<{
    booking_id: string;
    customer_name: string;
    booking_code: string;
  }>(sql`
    SELECT b.id AS booking_id, c.full_name AS customer_name, b.booking_code
    FROM bookings b
    INNER JOIN customers c ON c.id = b.customer_id
    WHERE b.status = 'confirmed'
      AND b.duration_mode IN ('monthly', 'open_ended')
      AND EXISTS (
        SELECT 1 FROM bed_reservations br
        WHERE br.booking_id = b.id
          AND br.kind = 'primary'
          AND br.status = 'active'
          AND lower(br.stay_range) <= CURRENT_DATE
      )
      AND NOT EXISTS (
        SELECT 1 FROM bed_reservations br
        WHERE br.booking_id = b.id
          AND br.kind = 'primary'
          AND br.status = 'active'
          AND CURRENT_DATE <@ br.stay_range
      )
    LIMIT 50
  `);

  for (const row of Array.from(confirmedWithoutBed)) {
    issues.push({
      kind: 'missing_assignment',
      bedId: '',
      bedCode: '—',
      roomNumber: '—',
      pgId: '',
      pgName: '—',
      bookingId: row.booking_id,
      customerName: row.customer_name,
      detail: `Confirmed booking ${row.booking_code} has no active bed reservation today.`,
    });
  }

  return { asOf: new Date().toISOString(), issues, bedsChecked: bedsRows.length };
}

export async function repairBedAuditIssue(
  issue: BedAuditIssue,
  actorId?: string,
): Promise<{ ok: boolean; message: string }> {
  const logRepair = async (action: string, diff: Record<string, unknown>) => {
    if (!issue.bedId && !issue.bookingId) return;
    await db.insert(auditLog).values({
      actorType: actorId ? 'admin' : 'system',
      actorId: actorId ?? null,
      entity: 'bed',
      entityId: issue.bedId || issue.bookingId!,
      action,
      diff,
    });
  };

  if (issue.kind === 'ghost_occupied' && issue.bedId) {
    await db
      .update(beds)
      .set({ manualOccupied: false, updatedAt: new Date() })
      .where(eq(beds.id, issue.bedId));
    await logRepair('bed_repair_clear_ghost_occupancy', { bedId: issue.bedId, issue: issue.kind });
    return { ok: true, message: 'Cleared manual occupied flag.' };
  }

  if (issue.kind === 'missing_assignment' && issue.bedId && issue.bookingId) {
    await logRepair('bed_repair_reservation_sync', {
      bedId: issue.bedId,
      bookingId: issue.bookingId,
      note: 'Reservation is SSOT — cleared stale manual mark only',
    });
    await clearBedAdminMarks(issue.bedId);
    return { ok: true, message: 'Cleared stale manual mark; reservation is source of truth.' };
  }

  if (issue.kind === 'double_assignment' && issue.bedId) {
    const today = formatDate(new Date());
    const activeReservations = await db
      .select({ reservationId: bedReservations.id, bookingId: bedReservations.bookingId })
      .from(bedReservations)
      .innerJoin(bookings, eq(bookings.id, bedReservations.bookingId))
      .where(
        and(
          eq(bedReservations.bedId, issue.bedId),
          eq(bedReservations.status, 'active'),
          eq(bedReservations.kind, 'primary'),
          eq(bookings.status, 'confirmed'),
          sql`${today}::date <@ ${bedReservations.stayRange}`,
        ),
      );

    if (activeReservations.length <= 1) {
      return { ok: false, message: 'Double assignment no longer present.' };
    }

    const keep = issue.bookingId
      ? activeReservations.find((r) => r.bookingId === issue.bookingId)
      : activeReservations[0];
    const toRelease = activeReservations.filter((r) => r.reservationId !== keep?.reservationId);

    for (const r of toRelease) {
      await db
        .update(bedReservations)
        .set({ status: 'cancelled', updatedAt: new Date() })
        .where(eq(bedReservations.id, r.reservationId));
    }

    await clearBedAdminMarks(issue.bedId);

    await logRepair('bed_repair_double_assignment', {
      bedId: issue.bedId,
      keptBookingId: keep?.bookingId,
      released: toRelease.map((r) => r.bookingId),
    });
    return { ok: true, message: `Released ${toRelease.length} duplicate reservation(s).` };
  }

  if (issue.kind === 'missing_assignment' && issue.bookingId && !issue.bedId) {
    return {
      ok: false,
      message: 'Assign bed manually from Residents — no bed linked to repair.',
    };
  }

  return { ok: false, message: 'Automatic repair not available — resolve manually.' };
}
