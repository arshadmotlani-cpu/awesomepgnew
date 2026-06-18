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
