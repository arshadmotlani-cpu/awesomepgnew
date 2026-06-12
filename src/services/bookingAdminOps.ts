import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { auditLog, beds, bedReservations, bedReserveHolds, bookings, customers, floors, pgs, rooms } from '@/src/db/schema';
import { adminCanAccessPg } from '@/src/lib/auth/roles';
import type { AdminSession } from '@/src/lib/auth/session';
import { formatDate, isBefore, parseDate, todayString } from '@/src/lib/dates';
import { RESERVE_MIN_PERIOD_DAYS } from '@/src/lib/bedReservePolicy';
import type {
  AdminDepositRefundStatus,
  AdminDuesStatus,
} from '@/src/lib/bookingAdminOpsLabels';
export type { AdminDepositRefundStatus, AdminDuesStatus } from '@/src/lib/bookingAdminOpsLabels';
export {
  labelAdminDepositRefundStatus,
  labelAdminDuesStatus,
} from '@/src/lib/bookingAdminOpsLabels';

export type BedInventoryStatus = 'available' | 'maintenance' | 'blocked';

/**
 * Clears stale unpaid holds and ghost reservations, then reports any real
 * confirmed stay that would block an admin occupied/reserved mark.
 */
export async function reconcileBedForAdminMark(
  bedId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await db.execute(sql`
    UPDATE bed_reservations br
    SET status = 'cancelled', updated_at = now()
    FROM bookings bk
    WHERE br.booking_id = bk.id
      AND br.bed_id = ${bedId}::uuid
      AND br.status IN ('hold', 'active')
      AND CURRENT_DATE <@ br.stay_range
      AND bk.status IN ('cancelled', 'refunded')
  `);

  const unpaidHolds = await db
    .select({
      reservationId: bedReservations.id,
      bookingId: bookings.id,
    })
    .from(bedReservations)
    .innerJoin(bookings, eq(bookings.id, bedReservations.bookingId))
    .where(
      and(
        eq(bedReservations.bedId, bedId),
        eq(bedReservations.status, 'hold'),
        eq(bookings.status, 'pending_payment'),
        sql`CURRENT_DATE <@ ${bedReservations.stayRange}`,
      ),
    );

  for (const row of unpaidHolds) {
    await db.transaction(async (tx) => {
      await tx
        .update(bedReservations)
        .set({ status: 'cancelled', updatedAt: new Date() })
        .where(eq(bedReservations.id, row.reservationId));

      const [counts] = await tx
        .select({
          live: sql<number>`count(*) FILTER (WHERE ${bedReservations.status} IN ('hold', 'active'))::int`,
        })
        .from(bedReservations)
        .where(eq(bedReservations.bookingId, row.bookingId));

      if ((counts?.live ?? 0) === 0) {
        await tx
          .update(bookings)
          .set({
            status: 'cancelled',
            cancelledAt: new Date(),
            cancellationReason: 'Unpaid hold cleared for admin bed mark.',
            updatedAt: new Date(),
          })
          .where(eq(bookings.id, row.bookingId));
      }
    });
  }

  const [remaining] = await db
    .select({
      bookingCode: bookings.bookingCode,
      durationMode: bookings.durationMode,
      customerName: customers.fullName,
    })
    .from(bedReservations)
    .innerJoin(bookings, eq(bookings.id, bedReservations.bookingId))
    .innerJoin(customers, eq(customers.id, bookings.customerId))
    .where(
      and(
        eq(bedReservations.bedId, bedId),
        inArray(bedReservations.status, ['hold', 'active']),
        eq(bookings.status, 'confirmed'),
        sql`CURRENT_DATE <@ ${bedReservations.stayRange}`,
      ),
    )
    .limit(1);

  if (remaining) {
    const guest = remaining.customerName ? ` (${remaining.customerName})` : '';
    return {
      ok: false,
      error:
        `Bed has confirmed booking ${remaining.bookingCode}${guest} — ` +
        `${remaining.durationMode.replace('_', ' ')} stay. Cancel or reassign that booking first, ` +
        `or use Assign tenant if this person is moving in.`,
    };
  }

  const [pendingHold] = await db
    .select({ bookingCode: bookings.bookingCode })
    .from(bedReservations)
    .innerJoin(bookings, eq(bookings.id, bedReservations.bookingId))
    .where(
      and(
        eq(bedReservations.bedId, bedId),
        eq(bedReservations.status, 'hold'),
        eq(bookings.status, 'pending_payment'),
        sql`CURRENT_DATE <@ ${bedReservations.stayRange}`,
      ),
    )
    .limit(1);

  if (pendingHold) {
    return {
      ok: false,
      error: `Bed has unpaid checkout ${pendingHold.bookingCode}. Wait for payment or cancel it from Bookings.`,
    };
  }

  return { ok: true };
}

async function assertBookingAccess(session: AdminSession, bookingId: string) {
  const [row] = await db
    .select({ pgId: floors.pgId })
    .from(bookings)
    .innerJoin(bedReservations, eq(bedReservations.bookingId, bookings.id))
    .innerJoin(beds, eq(beds.id, bedReservations.bedId))
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .where(eq(bookings.id, bookingId))
    .limit(1);
  if (!row) throw new Error('Booking not found.');
  if (!adminCanAccessPg({ role: session.role, pgScope: session.pgScope }, row.pgId)) {
    throw new Error('You do not have access to this booking.');
  }
}

async function assertBedAccess(session: AdminSession, bedId: string) {
  const [row] = await db
    .select({ pgId: floors.pgId })
    .from(beds)
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .where(and(eq(beds.id, bedId), isNull(beds.archivedAt)))
    .limit(1);
  if (!row) throw new Error('Bed not found.');
  if (!adminCanAccessPg({ role: session.role, pgScope: session.pgScope }, row.pgId)) {
    throw new Error('You do not have access to this bed.');
  }
}

export async function updateBookingAdminOps(
  session: AdminSession,
  bookingId: string,
  input: {
    adminDuesStatus?: AdminDuesStatus;
    adminDepositRefundStatus?: AdminDepositRefundStatus;
    adminOpsNotes?: string | null;
  },
) {
  await assertBookingAccess(session, bookingId);

  const [before] = await db
    .select({
      adminDuesStatus: bookings.adminDuesStatus,
      adminDepositRefundStatus: bookings.adminDepositRefundStatus,
      adminOpsNotes: bookings.adminOpsNotes,
    })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);
  if (!before) throw new Error('Booking not found.');

  await db
    .update(bookings)
    .set({
      adminDuesStatus: input.adminDuesStatus ?? undefined,
      adminDepositRefundStatus: input.adminDepositRefundStatus ?? undefined,
      adminOpsNotes:
        input.adminOpsNotes !== undefined ? input.adminOpsNotes?.trim() || null : undefined,
      updatedAt: new Date(),
    })
    .where(eq(bookings.id, bookingId));

  await db.insert(auditLog).values({
    actorType: 'admin',
    actorId: session.adminId,
    entity: 'booking',
    entityId: bookingId,
    action: 'admin_ops_updated',
    diff: {
      before,
      after: {
        adminDuesStatus: input.adminDuesStatus ?? before.adminDuesStatus,
        adminDepositRefundStatus:
          input.adminDepositRefundStatus ?? before.adminDepositRefundStatus,
        adminOpsNotes:
          input.adminOpsNotes !== undefined
            ? input.adminOpsNotes?.trim() || null
            : before.adminOpsNotes,
      },
    },
  });
}

export async function updateBedInventoryStatus(
  session: AdminSession,
  bedId: string,
  status: BedInventoryStatus,
) {
  await assertBedAccess(session, bedId);

  const [before] = await db
    .select({ status: beds.status, bedCode: beds.bedCode, pgName: pgs.name })
    .from(beds)
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .innerJoin(pgs, eq(pgs.id, floors.pgId))
    .where(eq(beds.id, bedId))
    .limit(1);
  if (!before) throw new Error('Bed not found.');

  await db
    .update(beds)
    .set({ status, updatedAt: new Date() })
    .where(eq(beds.id, bedId));

  await db.insert(auditLog).values({
    actorType: 'admin',
    actorId: session.adminId,
    entity: 'bed',
    entityId: bedId,
    action: 'inventory_status_updated',
    diff: {
      pgName: before.pgName,
      bedCode: before.bedCode,
      from: before.status,
      to: status,
    },
  });
}

export async function clearBedAdminMarks(bedId: string): Promise<void> {
  await db
    .update(beds)
    .set({
      manualOccupied: false,
      manualReservedStart: null,
      manualReservedCheckIn: null,
      updatedAt: new Date(),
    })
    .where(eq(beds.id, bedId));
}

export async function setBedManualOccupied(
  session: AdminSession,
  bedId: string,
  occupied: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await assertBedAccess(session, bedId);

    const [bed] = await db
      .select({
        status: beds.status,
        bedCode: beds.bedCode,
        manualOccupied: beds.manualOccupied,
        pgName: pgs.name,
      })
      .from(beds)
      .innerJoin(rooms, eq(rooms.id, beds.roomId))
      .innerJoin(floors, eq(floors.id, rooms.floorId))
      .innerJoin(pgs, eq(pgs.id, floors.pgId))
      .where(and(eq(beds.id, bedId), isNull(beds.archivedAt)))
      .limit(1);
    if (!bed) return { ok: false, error: 'Bed not found.' };

    if (occupied) {
      if (bed.status !== 'available') {
        return { ok: false, error: 'Only available beds can be marked occupied.' };
      }
      const [manualReserve] = await db
        .select({ id: beds.id })
        .from(beds)
        .where(
          and(
            eq(beds.id, bedId),
            sql`${beds.manualReservedCheckIn} IS NOT NULL`,
            sql`${beds.manualReservedCheckIn} >= CURRENT_DATE`,
          ),
        )
        .limit(1);
      if (manualReserve) {
        return { ok: false, error: 'Clear the reserved mark before marking occupied.' };
      }

      const reconciled = await reconcileBedForAdminMark(bedId);
      if (!reconciled.ok) return reconciled;
    }

    await db
      .update(beds)
      .set({ manualOccupied: occupied, updatedAt: new Date() })
      .where(eq(beds.id, bedId));

    await db.insert(auditLog).values({
      actorType: 'admin',
      actorId: session.adminId,
      entity: 'bed',
      entityId: bedId,
      action: occupied ? 'manual_occupied_set' : 'manual_occupied_cleared',
      diff: {
        pgName: bed.pgName,
        bedCode: bed.bedCode,
        from: bed.manualOccupied,
        to: occupied,
      },
    });

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function setBedManualReserved(
  session: AdminSession,
  bedId: string,
  checkInDate: string,
  reserveStart?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await assertBedAccess(session, bedId);

    const start = formatDate(parseDate(reserveStart ?? todayString()));
    const checkIn = formatDate(parseDate(checkInDate));

    if (!isBefore(parseDate(start), parseDate(checkIn))) {
      return { ok: false, error: 'Check-in date must be after reserve start.' };
    }
    const periodDays =
      Math.round(
        (parseDate(checkIn).getTime() - parseDate(start).getTime()) / (24 * 60 * 60 * 1000),
      );
    if (periodDays < RESERVE_MIN_PERIOD_DAYS) {
      return {
        ok: false,
        error: `Reserve period must be at least ${RESERVE_MIN_PERIOD_DAYS} days.`,
      };
    }

    const [bed] = await db
      .select({
        status: beds.status,
        bedCode: beds.bedCode,
        manualOccupied: beds.manualOccupied,
        pgName: pgs.name,
      })
      .from(beds)
      .innerJoin(rooms, eq(rooms.id, beds.roomId))
      .innerJoin(floors, eq(floors.id, rooms.floorId))
      .innerJoin(pgs, eq(pgs.id, floors.pgId))
      .where(and(eq(beds.id, bedId), isNull(beds.archivedAt)))
      .limit(1);
    if (!bed) return { ok: false, error: 'Bed not found.' };

    if (bed.status !== 'available') {
      return { ok: false, error: 'Only available beds can be marked reserved.' };
    }
    if (bed.manualOccupied) {
      return { ok: false, error: 'Clear occupied mark before marking reserved.' };
    }

    const reconciled = await reconcileBedForAdminMark(bedId);
    if (!reconciled.ok) return reconciled;

    const [hold] = await db
      .select({ id: bedReserveHolds.id })
      .from(bedReserveHolds)
      .where(
        and(
          eq(bedReserveHolds.bedId, bedId),
          sql`${bedReserveHolds.status} IN ('pending_payment', 'active')`,
        ),
      )
      .limit(1);
    if (hold) {
      return { ok: false, error: 'This bed already has a customer reserve hold.' };
    }

    await db
      .update(beds)
      .set({
        manualReservedStart: start,
        manualReservedCheckIn: checkIn,
        updatedAt: new Date(),
      })
      .where(eq(beds.id, bedId));

    await db.insert(auditLog).values({
      actorType: 'admin',
      actorId: session.adminId,
      entity: 'bed',
      entityId: bedId,
      action: 'manual_reserved_set',
      diff: {
        pgName: bed.pgName,
        bedCode: bed.bedCode,
        reserveStart: start,
        checkInDate: checkIn,
      },
    });

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function clearBedManualReserved(
  session: AdminSession,
  bedId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await assertBedAccess(session, bedId);

    const [bed] = await db
      .select({
        bedCode: beds.bedCode,
        manualReservedCheckIn: beds.manualReservedCheckIn,
        pgName: pgs.name,
      })
      .from(beds)
      .innerJoin(rooms, eq(rooms.id, beds.roomId))
      .innerJoin(floors, eq(floors.id, rooms.floorId))
      .innerJoin(pgs, eq(pgs.id, floors.pgId))
      .where(and(eq(beds.id, bedId), isNull(beds.archivedAt)))
      .limit(1);
    if (!bed) return { ok: false, error: 'Bed not found.' };
    if (!bed.manualReservedCheckIn) {
      return { ok: false, error: 'Bed is not marked reserved.' };
    }

    await db
      .update(beds)
      .set({
        manualReservedStart: null,
        manualReservedCheckIn: null,
        updatedAt: new Date(),
      })
      .where(eq(beds.id, bedId));

    await db.insert(auditLog).values({
      actorType: 'admin',
      actorId: session.adminId,
      entity: 'bed',
      entityId: bedId,
      action: 'manual_reserved_cleared',
      diff: {
        pgName: bed.pgName,
        bedCode: bed.bedCode,
        fromCheckIn: String(bed.manualReservedCheckIn),
      },
    });

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
