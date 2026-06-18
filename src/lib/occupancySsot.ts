/**
 * Single source of truth for live bed occupancy.
 *
 * A resident is assigned when ALL of:
 * - booking.status = confirmed
 * - bed_reservation.status = active
 * - bed_reservation.kind = primary
 * - CURRENT_DATE is within stay_range
 *
 * Used by Residents list, Bed Maps, search, assign-bed guards, and diagnostics.
 */

import { sql } from 'drizzle-orm';

/** Booking alias `bk`, reservation alias `br` (bed-map style). */
export const occupancyReservationCoreSql = sql`
  bk.status = 'confirmed'
  AND br.status = 'active'
  AND br.kind = 'primary'
  AND CURRENT_DATE <@ br.stay_range
`;

/** Booking alias `b`, reservation alias `br` (customer/resident style). */
export const occupancyReservationCoreSql_b = sql`
  b.status = 'confirmed'
  AND br.status = 'active'
  AND br.kind = 'primary'
  AND CURRENT_DATE <@ br.stay_range
`;

/**
 * EXISTS filter for a bed row aliased as `beds` — occupied today per SSOT.
 * Use in dashboard occupancy counts and availability filters.
 */
export const bedOccupiedTodayExistsSql = sql`
  EXISTS (
    SELECT 1
    FROM bed_reservations br
    INNER JOIN bookings bk ON bk.id = br.booking_id
    WHERE br.bed_id = beds.id
      AND bk.status = 'confirmed'
      AND br.status = 'active'
      AND br.kind = 'primary'
      AND CURRENT_DATE <@ br.stay_range
  )
`;

/**
 * EXISTS filter for customer row aliased as `c` — has active bed assignment today.
 */
export const customerOccupiedTodayExistsSql = sql`
  EXISTS (
    SELECT 1
    FROM bookings b
    INNER JOIN bed_reservations br ON br.booking_id = b.id
    WHERE b.customer_id = c.id
      AND b.status = 'confirmed'
      AND br.status = 'active'
      AND br.kind = 'primary'
      AND CURRENT_DATE <@ br.stay_range
  )
`;
