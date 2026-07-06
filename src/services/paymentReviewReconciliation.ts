/**
 * Payment review reconciliation — single write path that heals stale queue state.
 * Runs on every Operations queue load before reads.
 */
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { actionItems, bookings, pgPaymentRecords, unresolvedActions } from '@/src/db/schema';
import {
  bookingSupersededByNewerAnchoredStaySql,
  staleBookingPaymentReviewSql,
} from '@/src/lib/operations/paymentReviewSsot';
import { finalizeStaleBookingPaymentReview } from '@/src/services/paymentProofReviewCleanup';
import { resolveAction } from '@/src/services/unresolvedActions';

export type PaymentReviewReconciliationReport = {
  supersededOrphanBookings: number;
  linkedOrphanRecords: number;
  finalizedStaleRecords: number;
  resolvedActionItems: number;
  closedUnresolved: number;
  archivedNotifications: number;
};

/** Link pending proofs missing booking_id when customer has a matching awaiting booking. */
async function linkOrphanBookingPaymentRecords(): Promise<number> {
  const linked = await db.execute<{ id: string }>(sql`
    UPDATE pg_payment_records pr
    SET booking_id = b.id, updated_at = now()
    FROM bookings b
    INNER JOIN bed_reservations br ON br.booking_id = b.id AND br.kind = 'primary'
    INNER JOIN beds bd ON bd.id = br.bed_id
    INNER JOIN rooms r ON r.id = bd.room_id
    INNER JOIN floors f ON f.id = r.floor_id
    WHERE pr.booking_id IS NULL
      AND pr.customer_id = b.customer_id
      AND pr.pg_id = f.pg_id
      AND pr.status = 'pending'
      AND pr.payment_screenshot_url IS NOT NULL
      AND trim(pr.payment_screenshot_url) <> ''
      AND b.status IN ('pending_payment', 'pending_approval')
    RETURNING pr.id::text AS id
  `);
  return linked.length;
}

async function supersedeOrphanOpenBookingsWithNewerStay(): Promise<number> {
  const rows = await db.execute<{ open_id: string; newer_id: string }>(sql`
    SELECT
      b.id::text AS open_id,
      (
        SELECT newer.id::text
        FROM bookings newer
        INNER JOIN bed_reservations nbr ON nbr.booking_id = newer.id AND nbr.kind = 'primary'
        INNER JOIN beds nbd ON nbd.id = nbr.bed_id
        INNER JOIN rooms nr ON nr.id = nbd.room_id
        INNER JOIN floors nf ON nf.id = nr.floor_id
        WHERE newer.customer_id = b.customer_id
          AND newer.status IN ('confirmed', 'completed')
          AND newer.created_at > b.created_at
          AND newer.id <> b.id
          AND (
            nf.pg_id IN (
              SELECT f2.pg_id
              FROM bed_reservations obr2
              INNER JOIN beds bd2 ON bd2.id = obr2.bed_id
              INNER JOIN rooms r2 ON r2.id = bd2.room_id
              INNER JOIN floors f2 ON f2.id = r2.floor_id
              WHERE obr2.booking_id = b.id AND obr2.kind = 'primary'
            )
            OR nf.pg_id IN (
              SELECT pr2.pg_id FROM pg_payment_records pr2 WHERE pr2.booking_id = b.id
            )
          )
        ORDER BY newer.created_at DESC
        LIMIT 1
      ) AS newer_id
    FROM bookings b
    WHERE b.status IN ('draft', 'pending_payment', 'pending_approval')
      AND (${bookingSupersededByNewerAnchoredStaySql})
  `);

  if (rows.length === 0) return 0;

  const { supersedeBooking } = await import('@/src/services/supersededBookingLifecycle');
  let count = 0;
  for (const row of rows) {
    if (!row.newer_id) continue;
    await supersedeBooking({
      bookingId: row.open_id,
      supersededByBookingId: row.newer_id,
    });
    count += 1;
  }
  return count;
}

async function listActiveBookingPaymentReviewKeys(): Promise<Set<string>> {
  const rows = await db.execute<{ review_key: string }>(sql`
    SELECT ('qr-' || pr.id::text) AS review_key
    FROM pg_payment_records pr
    INNER JOIN bookings b ON b.id = pr.booking_id
    WHERE pr.status = 'pending'
      AND pr.payment_screenshot_url IS NOT NULL
      AND trim(pr.payment_screenshot_url) <> ''
      AND b.status IN ('pending_payment', 'pending_approval', 'draft')
      AND NOT (${bookingSupersededByNewerAnchoredStaySql})
      AND NOT EXISTS (
        SELECT 1 FROM payments p
        WHERE p.booking_id = pr.booking_id
          AND p.status = 'succeeded'
          AND p.purpose IN ('booking', 'bed_reserve')
      )
      AND NOT EXISTS (
        SELECT 1 FROM payments p
        WHERE p.provider = 'upi_manual'
          AND p.provider_payment_id = 'qr_record_' || pr.id::text
          AND p.status = 'succeeded'
      )
      AND NOT EXISTS (
        SELECT 1 FROM bed_reservations br
        WHERE br.booking_id = pr.booking_id
          AND br.kind = 'primary'
          AND br.status = 'active'
          AND b.status IN ('confirmed', 'completed')
          AND CURRENT_DATE <@ br.stay_range
      )
  `);
  return new Set(rows.map((r) => r.review_key));
}

async function closeOrphanPaymentReviewArtifacts(activeReviewKeys: Set<string>): Promise<{
  resolvedActionItems: number;
  closedUnresolved: number;
  archivedNotifications: number;
}> {
  const openPaymentItems = await db
    .select({ sourceKey: actionItems.sourceKey })
    .from(actionItems)
    .where(
      and(
        eq(actionItems.type, 'payment_received'),
        inArray(actionItems.status, ['open', 'in_progress']),
        sql`${actionItems.sourceKey} LIKE 'payment_review:%'`,
      ),
    );

  let resolvedActionItems = 0;
  const now = new Date();
  for (const row of openPaymentItems) {
    const reviewKey = row.sourceKey.replace(/^payment_review:/, '');
    if (activeReviewKeys.has(reviewKey)) continue;
    await db
      .update(actionItems)
      .set({ status: 'resolved', updatedAt: now })
      .where(eq(actionItems.sourceKey, row.sourceKey));
    resolvedActionItems += 1;
    await resolveAction({ sourceKey: `unresolved:${row.sourceKey}` });
  }

  const openUnresolved = await db
    .select({ sourceKey: unresolvedActions.sourceKey })
    .from(unresolvedActions)
    .where(
      and(
        eq(unresolvedActions.status, 'OPEN'),
        eq(unresolvedActions.actionType, 'payment_proof_review'),
      ),
    );

  let closedUnresolved = 0;
  for (const row of openUnresolved) {
    const reviewKey = row.sourceKey.replace(/^unresolved:payment_review:/, '');
    if (activeReviewKeys.has(reviewKey)) continue;
    closedUnresolved += await resolveAction({ sourceKey: row.sourceKey });
  }

  const archived = await db.execute<{ id: string }>(sql`
    UPDATE notifications n
    SET is_archived = true
    WHERE n.audience = 'admin'
      AND n.type IN ('payment_proof_uploaded', 'payment_received')
      AND NOT n.is_archived
      AND n.dedupe_key LIKE 'payment_review:%'
      AND NOT EXISTS (
        SELECT 1 FROM action_items ai
        WHERE ai.source_key = n.dedupe_key
          AND ai.type = 'payment_received'
          AND ai.status IN ('open', 'in_progress')
      )
    RETURNING n.id
  `);

  return {
    resolvedActionItems,
    closedUnresolved,
    archivedNotifications: archived.length,
  };
}

/** True when proof is approved or no longer actionable (booking activated, payment recorded, resident assigned). */
export async function isBookingPaymentProofProcessed(recordId: string): Promise<boolean> {
  const [approved] = await db
    .select({ id: pgPaymentRecords.id })
    .from(pgPaymentRecords)
    .where(and(eq(pgPaymentRecords.id, recordId), eq(pgPaymentRecords.status, 'approved')))
    .limit(1);
  if (approved) return true;

  const stale = await db.execute<{ id: string }>(sql`
    SELECT pr.id::text AS id
    FROM pg_payment_records pr
    LEFT JOIN bookings b ON b.id = pr.booking_id
    WHERE pr.id = ${recordId}::uuid
      AND ${staleBookingPaymentReviewSql}
    LIMIT 1
  `);
  return stale.length > 0;
}

/**
 * SSOT reconciliation — finalize every non-actionable booking payment proof and
 * close all orphaned queue artifacts.
 */
export async function reconcileBookingPaymentReviewQueue(): Promise<PaymentReviewReconciliationReport> {
  const supersededOrphanBookings = await supersedeOrphanOpenBookingsWithNewerStay();
  const linkedOrphanRecords = await linkOrphanBookingPaymentRecords();

  const staleRows = await db.execute<{ id: string; booking_id: string }>(sql`
    SELECT pr.id::text AS id, pr.booking_id::text AS booking_id
    FROM pg_payment_records pr
    LEFT JOIN bookings b ON b.id = pr.booking_id
    WHERE ${staleBookingPaymentReviewSql}
  `);

  for (const row of staleRows) {
    await finalizeStaleBookingPaymentReview({
      recordId: row.id,
      bookingId: row.booking_id,
    });
  }

  const activeKeys = await listActiveBookingPaymentReviewKeys();
  const artifactCleanup = await closeOrphanPaymentReviewArtifacts(activeKeys);

  return {
    supersededOrphanBookings,
    linkedOrphanRecords,
    finalizedStaleRecords: staleRows.length,
    ...artifactCleanup,
  };
}
