/**
 * Superseded booking lifecycle — auto-close orphan open bookings when a newer booking confirms.
 *
 * Trigger: immediately when a booking becomes confirmed (payment success or admin walk-in).
 * No cron, no manual repair — migration 0103 backfills historical rows once.
 */
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db, type Database } from '@/src/db/client';
import {
  actionItems,
  auditLog,
  bedReservations,
  bedReserveHolds,
  bookings,
  pgPaymentRecords,
} from '@/src/db/schema';
import {
  isOpenBookingLifecycleStatus,
  OPEN_BOOKING_LIFECYCLE_STATUSES,
} from '@/src/lib/booking/supersededBookingLifecycle';
import { finalizeStaleBookingPaymentReview } from '@/src/services/paymentProofReviewCleanup';
import { resolveAction } from '@/src/services/unresolvedActions';

type DbExecutor = Database | Parameters<Parameters<Database['transaction']>[0]>[0];

export type SupersedePriorOpenBookingsResult = {
  supersededBookingIds: string[];
  finalizedPaymentRecordIds: string[];
};

async function resolveBookingApprovalArtifacts(
  executor: DbExecutor,
  bookingId: string,
): Promise<void> {
  const now = new Date();
  const sourceKey = `booking_approval:${bookingId}`;

  await executor
    .update(actionItems)
    .set({ status: 'resolved', updatedAt: now })
    .where(
      and(
        eq(actionItems.sourceKey, sourceKey),
        inArray(actionItems.status, ['open', 'in_progress']),
      ),
    );

  await resolveAction({ sourceKey: `unresolved:${sourceKey}` });

  await executor.execute(sql`
    UPDATE notifications n
    SET is_archived = true
    WHERE n.audience = 'admin'
      AND NOT n.is_archived
      AND n.dedupe_key = ${sourceKey}
  `);
}

async function loadConfirmedBookingAnchor(
  executor: DbExecutor,
  confirmedBookingId: string,
): Promise<{ customerId: string; pgId: string; createdAt: Date } | null> {
  const rows = await executor.execute<{
    customer_id: string;
    pg_id: string;
    created_at: Date;
  }>(sql`
    SELECT
      b.customer_id::text AS customer_id,
      f.pg_id::text AS pg_id,
      b.created_at AS created_at
    FROM bookings b
    INNER JOIN bed_reservations br ON br.booking_id = b.id AND br.kind = 'primary'
    INNER JOIN beds bd ON bd.id = br.bed_id
    INNER JOIN rooms r ON r.id = bd.room_id
    INNER JOIN floors f ON f.id = r.floor_id
    WHERE b.id = ${confirmedBookingId}::uuid
      AND b.status = 'confirmed'
    ORDER BY br.created_at ASC
    LIMIT 1
  `);

  const row = rows[0];
  if (!row) return null;
  return {
    customerId: row.customer_id,
    pgId: row.pg_id,
    createdAt: row.created_at,
  };
}

/** Open bookings for same customer + PG that predate the confirmed anchor booking. */
async function listPriorOpenBookingsSamePg(
  executor: DbExecutor,
  anchor: { customerId: string; pgId: string; confirmedBookingId: string; createdAt: Date },
): Promise<string[]> {
  const rows = await executor.execute<{ id: string }>(sql`
    SELECT DISTINCT o.id::text AS id
    FROM bookings o
    WHERE o.customer_id = ${anchor.customerId}::uuid
      AND o.id <> ${anchor.confirmedBookingId}::uuid
      AND o.status IN ('draft', 'pending_payment', 'pending_approval')
      AND o.created_at < ${anchor.createdAt}
      AND (
        EXISTS (
          SELECT 1
          FROM bed_reservations obr
          INNER JOIN beds obd ON obd.id = obr.bed_id
          INNER JOIN rooms orr ON orr.id = obd.room_id
          INNER JOIN floors of ON of.id = orr.floor_id
          WHERE obr.booking_id = o.id
            AND obr.kind = 'primary'
            AND of.pg_id = ${anchor.pgId}::uuid
        )
        OR EXISTS (
          SELECT 1
          FROM pg_payment_records pr
          WHERE pr.booking_id = o.id
            AND pr.pg_id = ${anchor.pgId}::uuid
        )
      )
    ORDER BY o.created_at ASC
  `);
  return rows.map((r) => r.id);
}

export async function supersedeBooking(args: {
  bookingId: string;
  supersededByBookingId: string;
  supersededByAdminId?: string | null;
  executor?: DbExecutor;
}): Promise<{ finalizedPaymentRecordIds: string[] }> {
  const executor = args.executor ?? db;
  const now = new Date();

  const [openBooking] = await executor
    .select({ id: bookings.id, status: bookings.status })
    .from(bookings)
    .where(eq(bookings.id, args.bookingId))
    .limit(1);

  if (!openBooking || !isOpenBookingLifecycleStatus(openBooking.status)) {
    return { finalizedPaymentRecordIds: [] };
  }

  await executor
    .update(bookings)
    .set({ status: 'superseded', updatedAt: now })
    .where(
      and(
        eq(bookings.id, args.bookingId),
        inArray(bookings.status, [...OPEN_BOOKING_LIFECYCLE_STATUSES]),
      ),
    );

  await executor
    .update(bedReservations)
    .set({ status: 'cancelled', holdExpiresAt: null, updatedAt: now })
    .where(
      and(
        eq(bedReservations.bookingId, args.bookingId),
        inArray(bedReservations.status, ['hold', 'under_review']),
      ),
    );

  await executor
    .update(bedReserveHolds)
    .set({ status: 'cancelled', holdExpiresAt: null, updatedAt: now })
    .where(
      and(
        eq(bedReserveHolds.bookingId, args.bookingId),
        inArray(bedReserveHolds.status, ['pending_payment', 'under_review', 'active']),
      ),
    );

  const pendingProofs = await executor
    .select({ id: pgPaymentRecords.id })
    .from(pgPaymentRecords)
    .where(
      and(
        eq(pgPaymentRecords.bookingId, args.bookingId),
        eq(pgPaymentRecords.status, 'pending'),
      ),
    );

  const finalizedPaymentRecordIds: string[] = [];
  for (const proof of pendingProofs) {
    await finalizeStaleBookingPaymentReview({
      recordId: proof.id,
      bookingId: args.bookingId,
      reviewedByAdminId: args.supersededByAdminId ?? null,
    });
    finalizedPaymentRecordIds.push(proof.id);
  }

  await resolveBookingApprovalArtifacts(executor, args.bookingId);

  await executor.insert(auditLog).values({
    actorType: args.supersededByAdminId ? 'admin' : 'system',
    actorId: args.supersededByAdminId ?? null,
    entity: 'booking',
    entityId: args.bookingId,
    action: 'superseded',
    diff: {
      supersededByBookingId: args.supersededByBookingId,
      priorStatus: openBooking.status,
    },
  });

  return { finalizedPaymentRecordIds };
}

/**
 * When `confirmedBookingId` becomes confirmed, supersede every older open booking for the
 * same customer at the same PG so Operations never shows stale payment reviews.
 */
export async function supersedePriorOpenBookingsForConfirmedBooking(
  confirmedBookingId: string,
  opts?: { supersededByAdminId?: string | null; executor?: DbExecutor },
): Promise<SupersedePriorOpenBookingsResult> {
  const executor = opts?.executor ?? db;
  const anchor = await loadConfirmedBookingAnchor(executor, confirmedBookingId);
  if (!anchor) {
    return { supersededBookingIds: [], finalizedPaymentRecordIds: [] };
  }

  const priorIds = await listPriorOpenBookingsSamePg(executor, {
    customerId: anchor.customerId,
    pgId: anchor.pgId,
    confirmedBookingId,
    createdAt: anchor.createdAt,
  });

  const supersededBookingIds: string[] = [];
  const finalizedPaymentRecordIds: string[] = [];

  for (const bookingId of priorIds) {
    const result = await supersedeBooking({
      bookingId,
      supersededByBookingId: confirmedBookingId,
      supersededByAdminId: opts?.supersededByAdminId ?? null,
      executor,
    });
    supersededBookingIds.push(bookingId);
    finalizedPaymentRecordIds.push(...result.finalizedPaymentRecordIds);
  }

  return { supersededBookingIds, finalizedPaymentRecordIds };
}
