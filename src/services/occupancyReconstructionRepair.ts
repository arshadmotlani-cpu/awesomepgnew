/**
 * Reconstruct occupancy from booking history — no placeholders, no guessing.
 *
 * Reactivates primary reservations only when a confirmed booking has
 * documentary evidence the resident has not checked out.
 */

import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { auditLog, bedReservations, beds, pgs } from '@/src/db/schema';
import { reconcileBookingOccupancy } from '@/src/lib/occupancySync';

export const OCCUPANCY_REPAIR_PG_NAME_PATTERNS = ['central', 'trimurti'] as const;

export type OccupancyReconstructionRow = {
  bookingId: string;
  bookingCode: string;
  pgName: string;
  bedCode: string;
  reservationId: string;
  reservationStatus: string;
  stayRange: string;
  action: 'reactivate_reservation' | 'extend_stay_range' | 'clear_manual_occupied' | 'skipped';
  reason: string;
};

export type OccupancyReconstructionResult = {
  pgIds: string[];
  pgNames: string[];
  actions: OccupancyReconstructionRow[];
  reservationsReactivated: number;
  stayRangesExtended: number;
  manualFlagsCleared: number;
  bookingsReconciled: number;
  skipped: number;
};

async function findTargetPgs(): Promise<Array<{ id: string; name: string }>> {
  const rows = await db
    .select({ id: pgs.id, name: pgs.name })
    .from(pgs)
    .where(and(isNull(pgs.archivedAt), eq(pgs.isActive, true)));

  return rows.filter((pg) => {
    const n = pg.name.toLowerCase();
    if (n.includes('female')) return false;
    return OCCUPANCY_REPAIR_PG_NAME_PATTERNS.some((p) => n.includes(p));
  });
}

type BrokenStayRow = {
  booking_id: string;
  booking_code: string;
  pg_name: string;
  bed_code: string;
  reservation_id: string;
  reservation_status: string;
  stay_range: string;
  duration_mode: string;
  covers_today: boolean;
  stay_upper_expired: boolean;
  has_future_vacating: boolean;
};

/** Confirmed stays that lost active reservation coverage but have not checked out. */
async function findBrokenConfirmedStays(pgIds: string[]): Promise<BrokenStayRow[]> {
  if (pgIds.length === 0) return [];
  return db.execute<BrokenStayRow>(sql`
    SELECT
      bk.id::text AS booking_id,
      bk.booking_code,
      p.name AS pg_name,
      bd.bed_code,
      br.id::text AS reservation_id,
      br.status::text AS reservation_status,
      br.stay_range::text AS stay_range,
      bk.duration_mode::text AS duration_mode,
      (CURRENT_DATE <@ br.stay_range) AS covers_today,
      (
        upper(br.stay_range) IS NOT NULL
        AND upper(br.stay_range) <= CURRENT_DATE
      ) AS stay_upper_expired,
      EXISTS (
        SELECT 1 FROM vacating_requests vr
        WHERE vr.booking_id = bk.id
          AND vr.status IN ('pending', 'approved')
          AND vr.vacating_date >= CURRENT_DATE
      ) AS has_future_vacating
    FROM bookings bk
    INNER JOIN bed_reservations br ON br.booking_id = bk.id AND br.kind = 'primary'
    INNER JOIN beds bd ON bd.id = br.bed_id
    INNER JOIN rooms r ON r.id = bd.room_id
    INNER JOIN floors f ON f.id = r.floor_id
    INNER JOIN pgs p ON p.id = f.pg_id
    WHERE bk.status = 'confirmed'
      AND f.pg_id = ANY(${sql.raw(`'{${pgIds.join(',')}}'::uuid[]`)})
      AND NOT (
        br.status = 'active'
        AND CURRENT_DATE <@ br.stay_range
      )
      AND NOT EXISTS (
        SELECT 1 FROM vacating_requests vr
        WHERE vr.booking_id = bk.id AND vr.status = 'completed'
      )
      AND NOT EXISTS (
        SELECT 1 FROM checkout_settlements cs
        WHERE cs.booking_id = bk.id
          AND cs.status IN ('refund_paid', 'completed')
      )
    ORDER BY p.name, bk.booking_code
  `);
}

async function findStaleManualOccupied(pgIds: string[]) {
  if (pgIds.length === 0) return [];
  return db.execute<{
    bed_id: string;
    bed_code: string;
    pg_name: string;
  }>(sql`
    SELECT bd.id::text AS bed_id, bd.bed_code, p.name AS pg_name
    FROM beds bd
    INNER JOIN rooms r ON r.id = bd.room_id
    INNER JOIN floors f ON f.id = r.floor_id
    INNER JOIN pgs p ON p.id = f.pg_id
    WHERE bd.archived_at IS NULL
      AND bd.manual_occupied = true
      AND f.pg_id = ANY(${sql.raw(`'{${pgIds.join(',')}}'::uuid[]`)})
      AND NOT EXISTS (
        SELECT 1 FROM bed_reservations br
        INNER JOIN bookings bk ON bk.id = br.booking_id
        WHERE br.bed_id = bd.id
          AND br.status = 'active'
          AND br.kind = 'primary'
          AND bk.status = 'confirmed'
          AND CURRENT_DATE <@ br.stay_range
      )
  `);
}

export async function reconstructOccupancyFromBookingHistory(): Promise<OccupancyReconstructionResult> {
  const targetPgs = await findTargetPgs();
  const pgIds = targetPgs.map((p) => p.id);
  const actions: OccupancyReconstructionRow[] = [];
  let reservationsReactivated = 0;
  let stayRangesExtended = 0;
  let manualFlagsCleared = 0;
  let bookingsReconciled = 0;
  let skipped = 0;

  const broken = await findBrokenConfirmedStays(pgIds);

  for (const row of broken) {
    const isMonthly =
      row.duration_mode === 'monthly' || row.duration_mode === 'open_ended';

    if (row.has_future_vacating && row.stay_upper_expired) {
      skipped += 1;
      actions.push({
        bookingId: row.booking_id,
        bookingCode: row.booking_code,
        pgName: row.pg_name,
        bedCode: row.bed_code,
        reservationId: row.reservation_id,
        reservationStatus: row.reservation_status,
        stayRange: row.stay_range,
        action: 'skipped',
        reason: 'Future vacating approved — stay ends at vacate date',
      });
      continue;
    }

    let changed = false;

    if (row.reservation_status !== 'active') {
      const updated = await db
        .update(bedReservations)
        .set({ status: 'active', updatedAt: new Date() })
        .where(
          and(
            eq(bedReservations.id, row.reservation_id),
            inArray(bedReservations.status, ['completed', 'cancelled', 'hold']),
          ),
        )
        .returning({ id: bedReservations.id });
      if (updated.length > 0) {
        reservationsReactivated += 1;
        changed = true;
        actions.push({
          bookingId: row.booking_id,
          bookingCode: row.booking_code,
          pgName: row.pg_name,
          bedCode: row.bed_code,
          reservationId: row.reservation_id,
          reservationStatus: row.reservation_status,
          stayRange: row.stay_range,
          action: 'reactivate_reservation',
          reason: 'Confirmed booking without checkout — reactivated primary reservation',
        });
      }
    }

    if (isMonthly && !row.covers_today && (row.stay_upper_expired || row.stay_range.includes('2099'))) {
      const extended = await db.execute<{ id: string }>(sql`
        UPDATE bed_reservations
        SET stay_range = daterange(lower(stay_range), NULL, '[)'),
            status = 'active',
            updated_at = now()
        WHERE id = ${row.reservation_id}::uuid
          AND booking_id = ${row.booking_id}::uuid
          AND NOT (CURRENT_DATE <@ stay_range)
        RETURNING id::text AS id
      `);
      if (extended.length > 0) {
        stayRangesExtended += 1;
        changed = true;
        actions.push({
          bookingId: row.booking_id,
          bookingCode: row.booking_code,
          pgName: row.pg_name,
          bedCode: row.bed_code,
          reservationId: row.reservation_id,
          reservationStatus: row.reservation_status,
          stayRange: row.stay_range,
          action: 'extend_stay_range',
          reason: 'Monthly confirmed stay — restored open-ended stay_range',
        });
      }
    }

    if (changed) {
      await reconcileBookingOccupancy(row.booking_id, { revalidate: false });
      bookingsReconciled += 1;
      await db.insert(auditLog).values({
        actorType: 'system',
        actorId: null,
        entity: 'booking',
        entityId: row.booking_id,
        action: 'occupancy_reconstructed_from_history',
        diff: {
          reservationId: row.reservation_id,
          pgName: row.pg_name,
          bedCode: row.bed_code,
        },
      });
    } else {
      skipped += 1;
      actions.push({
        bookingId: row.booking_id,
        bookingCode: row.booking_code,
        pgName: row.pg_name,
        bedCode: row.bed_code,
        reservationId: row.reservation_id,
        reservationStatus: row.reservation_status,
        stayRange: row.stay_range,
        action: 'skipped',
        reason: 'No repair action matched (already consistent or fixed-term stay)',
      });
    }
  }

  const staleManual = await findStaleManualOccupied(pgIds);
  for (const row of staleManual) {
    const cleared = await db
      .update(beds)
      .set({ manualOccupied: false, updatedAt: new Date() })
      .where(and(eq(beds.id, row.bed_id), eq(beds.manualOccupied, true)))
      .returning({ id: beds.id });
    if (cleared.length === 0) continue;
    manualFlagsCleared += 1;
    actions.push({
      bookingId: '',
      bookingCode: '',
      pgName: row.pg_name,
      bedCode: row.bed_code,
      reservationId: '',
      reservationStatus: '',
      stayRange: '',
      action: 'clear_manual_occupied',
      reason: 'No confirmed active reservation — cleared stale manual flag',
    });
  }

  return {
    pgIds,
    pgNames: targetPgs.map((p) => p.name),
    actions,
    reservationsReactivated,
    stayRangesExtended,
    manualFlagsCleared,
    bookingsReconciled,
    skipped,
  };
}
