/**
 * Deep links for Payment Review Workspace (SSOT for all payment approval entry points).
 */

import { eq, and } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { pgPaymentRecords } from '@/src/db/schema';

export function paymentReviewWorkspaceHref(reviewKey: string): string {
  return `/admin/payment-review/${encodeURIComponent(reviewKey)}`;
}

export function qrPaymentReviewKey(recordId: string): string {
  return `qr-${recordId}`;
}

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

/** Legacy operations focus links redirect to workspace. */
export function legacyOperationsFocusToWorkspaceHref(focusKey: string): string {
  return paymentReviewWorkspaceHref(focusKey);
}
