/**
 * Which reservation rows block inventory on the customer-facing calendar.
 *
 * `under_review` — reservation request submitted with payment proof; blocks
 *   inventory until admin approves or rejects.
 * `active` — confirmed reservation after admin approval.
 *
 * Legacy `hold` rows must not block (pre-proof checkout; being phased out).
 */
export const BLOCKING_RESERVATION_STATUSES = ['under_review', 'active'] as const;

export type BlockingReservationStatus = (typeof BLOCKING_RESERVATION_STATUSES)[number];

/**
 * SQL fragment for text-safe enum comparison: `br.status::text IN ('under_review','active')`.
 * Cast avoids query failure when migration 0107 has not added the enum value yet.
 */
export const BLOCKING_RESERVATION_STATUS_SQL = "('under_review', 'active')";

/** Booking statuses paired with blocking reservations (text-safe). */
export const BLOCKING_BOOKING_STATUSES_SQL = "('pending_approval', 'confirmed', 'completed')";

/** Under-review reservation request (post-proof). Safe before enum migration via ::text. */
export const UNDER_REVIEW_RESERVATION_PAIR_SQL = `(br.status::text = 'under_review' AND bk.status::text = 'pending_approval')`;

/** Legacy pre-proof hold — interest only, does not block inventory in the new lifecycle. */
export const LEGACY_HOLD_INTEREST_PAIR_SQL = `(br.status = 'hold' AND bk.status = 'pending_payment' AND (br.hold_expires_at IS NULL OR br.hold_expires_at > now()))`;

/** Under-review OR legacy hold — customer interest / in-progress checkout counts. */
export const RESERVATION_REQUEST_INTEREST_PAIR_SQL = `(${UNDER_REVIEW_RESERVATION_PAIR_SQL} OR ${LEGACY_HOLD_INTEREST_PAIR_SQL})`;
