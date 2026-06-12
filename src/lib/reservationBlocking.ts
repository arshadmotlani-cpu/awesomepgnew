/**
 * Which reservation rows block inventory on the customer-facing calendar.
 *
 * `hold` rows track in-progress checkouts awaiting UPI proof + admin review.
 * They must not make a bed look "booked" to other visitors.
 */
export const BLOCKING_RESERVATION_STATUSES = ['active'] as const;

export type BlockingReservationStatus = (typeof BLOCKING_RESERVATION_STATUSES)[number];

/** SQL fragment: `br.status IN ('active')` — use inside raw sql templates. */
export const BLOCKING_RESERVATION_STATUS_SQL = "('active')";
