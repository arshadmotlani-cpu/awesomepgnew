/**
 * Booking code generator.
 *
 * Codes look like `APG-2026-0001`. Per PROJECT_PLAN.md §2.3 the `bookings`
 * table has a unique index on `booking_code`, so we use a count-of-existing
 * bookings in the calendar year as the suffix and rely on the unique
 * constraint to reject collisions (the caller retries).
 *
 * Sequence-per-year is the right shape for human-readable codes, but it is
 * deliberately *not* a database sequence — using a sequence would make
 * codes monotonically increasing across years and surface gaps when bookings
 * are deleted. The count-based approach gives us dense, year-scoped codes
 * that match the PROJECT_PLAN example (`APG-2026-0001`).
 */

const PREFIX = 'APG';
const PAD = 4;

export function formatBookingCode(year: number, sequence: number): string {
  return `${PREFIX}-${year}-${String(sequence).padStart(PAD, '0')}`;
}

/**
 * Parse a code back into its components. Returns `null` if the shape doesn't
 * match — never throws — so callers can pattern-match without try/catch.
 */
export function parseBookingCode(
  code: string,
): { prefix: string; year: number; sequence: number } | null {
  const match = code.match(/^([A-Z]{2,5})-(\d{4})-(\d{1,8})$/);
  if (!match) return null;
  const [, prefix, yearStr, seqStr] = match;
  return { prefix, year: Number(yearStr), sequence: Number(seqStr) };
}

/**
 * Compute the next code given the current count of bookings that already
 * exist for `year`. Kept pure so the generator can be unit-tested without a
 * database — the count is the only signal it needs.
 */
export function nextBookingCode(year: number, countInYear: number): string {
  return formatBookingCode(year, countInYear + 1);
}

/** UTC year of a Date (defaults to "now"). */
export function utcYear(at: Date = new Date()): number {
  return at.getUTCFullYear();
}
