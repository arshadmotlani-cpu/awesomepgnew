/**
 * Generic room-transfer occupancy reconciliation — idempotent, no resident-specific logic.
 */

import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { auditLog, bedReservations, roomChangeRequests, roomTransferBedHolds } from '@/src/db/schema';
import { formatDate, parseDate } from '@/src/lib/dates';
import { applyResidentBedTransfer } from '@/src/services/roomTransferTenancy';

const TERMINAL_REQUEST_STATUSES = ['completed', 'cancelled', 'rejected'] as const;

/** Release holds left active after terminal room-change requests. */
export async function releaseStaleRoomTransferHolds(): Promise<{ released: number }> {
  const rows = await db
    .update(roomTransferBedHolds)
    .set({
      status: 'released',
      releasedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(roomTransferBedHolds.status, 'active'),
        sql`EXISTS (
          SELECT 1 FROM room_change_requests rcr
          WHERE rcr.id = ${roomTransferBedHolds.roomChangeRequestId}
            AND rcr.status IN ('completed', 'cancelled', 'rejected')
        )`,
      ),
    )
    .returning({ id: roomTransferBedHolds.id });

  if (rows.length > 0) {
    await db.insert(auditLog).values({
      actorType: 'system',
      actorId: null,
      entity: 'room_transfer_bed_hold',
      entityId: rows[0].id,
      action: 'stale_holds_released',
      diff: { count: rows.length, holdIds: rows.map((r) => r.id) },
    });
  }

  return { released: rows.length };
}

type CompletedMismatchRow = {
  request_id: string;
  booking_id: string;
  to_bed_id: string;
  transfer_date: string;
};

/**
 * Completed room-change requests must have the resident on the target bed.
 * Repairs drift when a journey was marked complete without tenancy transfer.
 */
export async function reconcileCompletedRoomChangeBedAssignments(): Promise<{
  scanned: number;
  repaired: number;
}> {
  const mismatches = await db.execute<CompletedMismatchRow>(sql`
    SELECT rcr.id AS request_id,
           rcr.booking_id,
           rcr.to_bed_id,
           coalesce(rcr.expected_transfer_date::text, rcr.completed_at::date::text) AS transfer_date
    FROM room_change_requests rcr
    INNER JOIN bookings bk ON bk.id = rcr.booking_id AND bk.status = 'confirmed'
    WHERE rcr.status = 'completed'
      AND rcr.completed_at > now() - interval '365 days'
      AND NOT EXISTS (
        SELECT 1 FROM bed_reservations br
        WHERE br.booking_id = rcr.booking_id
          AND br.bed_id = rcr.to_bed_id
          AND br.kind = 'primary'
          AND br.status = 'active'
          AND CURRENT_DATE <@ br.stay_range
      )
  `);

  let repaired = 0;
  for (const row of mismatches) {
    const transferDate = formatDate(parseDate(row.transfer_date));
    const moved = await applyResidentBedTransfer({
      bookingId: row.booking_id,
      toBedId: row.to_bed_id,
      transferDate,
      actorType: 'system',
      actorId: 'room-transfer-occupancy-reconcile',
      skipExitGuard: true,
    });
    if (moved.ok) repaired += 1;
  }

  return { scanned: mismatches.length, repaired };
}

/** Detect bookings with multiple active primary beds today (inventory invariant violation). */
export async function countDuplicateActivePrimaryBedAssignments(): Promise<number> {
  const rows = await db.execute<{ cnt: number }>(sql`
    SELECT count(*)::int AS cnt FROM (
      SELECT br.booking_id
      FROM bed_reservations br
      INNER JOIN bookings bk ON bk.id = br.booking_id
      WHERE br.status = 'active'
        AND br.kind = 'primary'
        AND bk.status = 'confirmed'
        AND CURRENT_DATE <@ br.stay_range
      GROUP BY br.booking_id
      HAVING count(*) > 1
    ) dup
  `);
  return rows[0]?.cnt ?? 0;
}

export async function runRoomTransferOccupancyReconciliation(): Promise<{
  staleHoldsReleased: number;
  completedAssignmentsScanned: number;
  completedAssignmentsRepaired: number;
  duplicateActivePrimary: number;
}> {
  const holds = await releaseStaleRoomTransferHolds();
  const assignments = await reconcileCompletedRoomChangeBedAssignments();
  const duplicateActivePrimary = await countDuplicateActivePrimaryBedAssignments();
  return {
    staleHoldsReleased: holds.released,
    completedAssignmentsScanned: assignments.scanned,
    completedAssignmentsRepaired: assignments.repaired,
    duplicateActivePrimary,
  };
}
