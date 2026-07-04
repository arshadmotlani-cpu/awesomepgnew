/**
 * Payment review SSOT — when a booking checkout proof belongs in Operations.
 *
 * Producers: submitBookingPaymentRecord (pg_payment_records pending + screenshot)
 * Consumers: paymentProofQueue, unifiedOperationsQueue, actionItems sync, badges
 *
 * A review is actionable ONLY while the booking awaits checkout payment review
 * and no successful booking payment or active primary assignment exists yet.
 */
import { sql } from 'drizzle-orm';

export const BOOKING_AWAITING_PAYMENT_REVIEW_STATUSES = [
  'pending_payment',
  'pending_approval',
  'draft',
] as const;

/** Pending booking checkout proofs that must be finalized (never shown in Operations). */
export const staleBookingPaymentReviewSql = sql`
  pr.status = 'pending'
  AND pr.payment_screenshot_url IS NOT NULL
  AND trim(pr.payment_screenshot_url) <> ''
  AND (
    pr.booking_id IS NULL
    OR b.id IS NULL
    OR b.status NOT IN ('pending_payment', 'pending_approval', 'draft')
    OR EXISTS (
      SELECT 1 FROM payments p
      WHERE p.booking_id = pr.booking_id
        AND p.status = 'succeeded'
        AND p.purpose IN ('booking', 'bed_reserve')
    )
    OR EXISTS (
      SELECT 1 FROM payments p
      WHERE p.provider = 'upi_manual'
        AND p.provider_payment_id = 'qr_record_' || pr.id::text
        AND p.status = 'succeeded'
    )
    OR EXISTS (
      SELECT 1 FROM bed_reservations br
      WHERE br.booking_id = pr.booking_id
        AND br.kind = 'primary'
        AND br.status = 'active'
        AND b.status IN ('confirmed', 'completed')
        AND CURRENT_DATE <@ br.stay_range
    )
  )
`;

export function isBookingCheckoutEligibleForPaymentReview(
  bookingStatus: string | null | undefined,
): boolean {
  if (!bookingStatus) return false;
  return (BOOKING_AWAITING_PAYMENT_REVIEW_STATUSES as readonly string[]).includes(bookingStatus);
}

export function isPaymentRecordEligibleForReview(
  recordStatus: string | null | undefined,
  hasScreenshot: boolean,
): boolean {
  if (recordStatus !== 'pending') return false;
  return hasScreenshot;
}
