/**
 * Server-only payment review link resolvers (database lookups).
 */

import { and, eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { pgPaymentRecords } from '@/src/db/schema';
import {
  paymentReviewWorkspaceHref,
  qrPaymentReviewKey,
} from '@/src/lib/operations/paymentReviewLinks';

/** Resolve pending booking checkout proof → review workspace URL. */
export async function pendingPaymentReviewHrefForBooking(
  bookingId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ id: pgPaymentRecords.id })
    .from(pgPaymentRecords)
    .where(
      and(
        eq(pgPaymentRecords.bookingId, bookingId),
        eq(pgPaymentRecords.status, 'pending'),
      ),
    )
    .limit(1);
  if (!row) return null;
  return paymentReviewWorkspaceHref(qrPaymentReviewKey(row.id));
}
