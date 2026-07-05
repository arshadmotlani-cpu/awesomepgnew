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
import {
  isOpenBookingLifecycleStatus,
  isSupersededBookingStatus,
} from '@/src/lib/booking/supersededBookingLifecycle';

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
    OR b.status = 'superseded'
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
    OR EXISTS (
      SELECT 1
      FROM bookings newer
      INNER JOIN bed_reservations nbr ON nbr.booking_id = newer.id AND nbr.kind = 'primary'
      INNER JOIN beds nbd ON nbd.id = nbr.bed_id
      INNER JOIN rooms nr ON nr.id = nbd.room_id
      INNER JOIN floors nf ON nf.id = nr.floor_id
      WHERE newer.customer_id = b.customer_id
        AND newer.status = 'confirmed'
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
            SELECT pr2.pg_id
            FROM pg_payment_records pr2
            WHERE pr2.booking_id = b.id
          )
        )
    )
  )
`;

export function isBookingCheckoutEligibleForPaymentReview(
  bookingStatus: string | null | undefined,
): boolean {
  if (!bookingStatus) return false;
  if (isSupersededBookingStatus(bookingStatus)) return false;
  return isOpenBookingLifecycleStatus(bookingStatus);
}

export function isPaymentRecordEligibleForReview(
  recordStatus: string | null | undefined,
  hasScreenshot: boolean,
): boolean {
  if (recordStatus !== 'pending') return false;
  return hasScreenshot;
}
