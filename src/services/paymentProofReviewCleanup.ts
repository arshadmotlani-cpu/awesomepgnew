/**
 * SSOT cleanup — one pending booking payment proof → one queue item.
 * Resolves duplicate pg_payment_records and shadow action items on approve/reject.
 */
import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { actionItems, bookings, pgPaymentRecords, unresolvedActions } from '@/src/db/schema';
import { resolveAction } from '@/src/services/unresolvedActions';

/** Close action_items, unresolved_actions, and admin notifications for one review key. */
export async function resolvePaymentReviewArtifactsForKey(reviewKey: string): Promise<void> {
  const actionSourceKey = `payment_review:${reviewKey}`;
  const unresolvedSourceKey = `unresolved:payment_review:${reviewKey}`;
  const now = new Date();

  await db
    .update(actionItems)
    .set({ status: 'resolved', updatedAt: now })
    .where(
      and(
        eq(actionItems.sourceKey, actionSourceKey),
        inArray(actionItems.status, ['open', 'in_progress']),
      ),
    );

  await resolveAction({ sourceKey: unresolvedSourceKey });

  await db.execute(sql`
    UPDATE notifications
    SET is_archived = true
    WHERE audience = 'admin'
      AND type IN ('payment_proof_uploaded', 'payment_received')
      AND NOT is_archived
      AND dedupe_key = ${actionSourceKey}
  `);
}

/**
 * Idempotent finalize — mark pending proof approved and remove all queue artifacts.
 * Safe when booking is already active or financial effects were already applied.
 */
export async function finalizeStaleBookingPaymentReview(args: {
  recordId: string;
  bookingId?: string | null;
  reviewedByAdminId?: string | null;
}): Promise<void> {
  const now = new Date();
  const reviewKey = `qr-${args.recordId}`;

  await db
    .update(pgPaymentRecords)
    .set({
      status: 'approved',
      ...(args.reviewedByAdminId ? { reviewedByAdminId: args.reviewedByAdminId } : {}),
      reviewedAt: now,
      updatedAt: now,
    })
    .where(
      and(eq(pgPaymentRecords.id, args.recordId), eq(pgPaymentRecords.status, 'pending')),
    );

  await resolvePaymentReviewArtifactsForKey(reviewKey);

  if (args.bookingId) {
    const [booking] = await db
      .select({ durationMode: bookings.durationMode })
      .from(bookings)
      .where(eq(bookings.id, args.bookingId))
      .limit(1);
    if (booking?.durationMode === 'reserve') {
      const { ensureBedReserveHoldActiveForBooking } = await import('./bedReserve');
      await ensureBedReserveHoldActiveForBooking(args.bookingId);
    }

    await resolveDuplicateBookingPaymentProofs({
      bookingId: args.bookingId,
      keepRecordId: args.recordId,
      resolution: 'approved',
    });
  }
}

/**
 * Remove orphan pending booking payment proofs when the booking is already past checkout review
 * or a succeeded booking payment already exists (prevents stale Operations rows).
 * @deprecated Use reconcileBookingPaymentReviewQueue — kept for callers during migration.
 */
export async function cleanupOrphanPendingBookingPaymentReviews(): Promise<{
  recordsFinalized: number;
}> {
  const { reconcileBookingPaymentReviewQueue } = await import(
    '@/src/services/paymentReviewReconciliation'
  );
  const report = await reconcileBookingPaymentReviewQueue();
  return { recordsFinalized: report.finalizedStaleRecords };
}

/** Resolve sibling pending QR proofs for the same booking (keep approved/rejected record). */
export async function resolveDuplicateBookingPaymentProofs(args: {
  bookingId: string;
  keepRecordId: string;
  resolution: 'approved' | 'rejected' | 'superseded';
}): Promise<number> {
  const siblings = await db
    .select({ id: pgPaymentRecords.id })
    .from(pgPaymentRecords)
    .where(
      and(
        eq(pgPaymentRecords.bookingId, args.bookingId),
        eq(pgPaymentRecords.status, 'pending'),
        ne(pgPaymentRecords.id, args.keepRecordId),
      ),
    );

  if (siblings.length === 0) return 0;

  const siblingIds = siblings.map((s) => s.id);
  const now = new Date();

  await db
    .update(pgPaymentRecords)
    .set({
      status: args.resolution === 'approved' ? 'approved' : 'rejected',
      paymentScreenshotUrl: null,
      reviewedAt: now,
      updatedAt: now,
    })
    .where(inArray(pgPaymentRecords.id, siblingIds));

  const actionSourceKeys = siblingIds.map((id) => `payment_review:qr-${id}`);
  const unresolvedSourceKeys = siblingIds.map((id) => `unresolved:payment_review:qr-${id}`);

  await db
    .update(actionItems)
    .set({ status: 'resolved', updatedAt: now })
    .where(
      and(
        inArray(actionItems.sourceKey, actionSourceKeys),
        inArray(actionItems.status, ['open', 'in_progress']),
      ),
    );

  await db
    .update(unresolvedActions)
    .set({ status: 'CLOSED', updatedAt: now })
    .where(
      and(
        inArray(unresolvedActions.sourceKey, unresolvedSourceKeys),
        eq(unresolvedActions.status, 'OPEN'),
      ),
    );

  return siblings.length;
}

/** Link orphan pending records (null booking_id) to booking when booking_code matches. */
export async function linkOrphanPendingPaymentToBooking(args: {
  bookingId: string;
  customerId: string;
  pgId: string;
}): Promise<void> {
  await db
    .update(pgPaymentRecords)
    .set({ bookingId: args.bookingId, updatedAt: new Date() })
    .where(
      and(
        eq(pgPaymentRecords.customerId, args.customerId),
        eq(pgPaymentRecords.pgId, args.pgId),
        eq(pgPaymentRecords.status, 'pending'),
        sql`${pgPaymentRecords.bookingId} IS NULL`,
        sql`${pgPaymentRecords.paymentScreenshotUrl} IS NOT NULL`,
      ),
    );
}
