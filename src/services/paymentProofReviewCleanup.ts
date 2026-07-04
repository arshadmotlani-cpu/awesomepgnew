/**
 * SSOT cleanup — one pending booking payment proof → one queue item.
 * Resolves duplicate pg_payment_records and shadow action items on approve/reject.
 */
import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { actionItems, pgPaymentRecords, unresolvedActions } from '@/src/db/schema';

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
