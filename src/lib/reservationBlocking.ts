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

/** SQL fragment: `br.status IN ('under_review','active')` */
export const BLOCKING_RESERVATION_STATUS_SQL = "('under_review', 'active')";

/** Booking statuses paired with blocking reservations. */
export const BLOCKING_BOOKING_STATUSES_SQL = "('pending_approval', 'confirmed', 'completed')";
