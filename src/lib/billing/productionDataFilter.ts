/**
 * Production-only filters — exclude test data and vacated residents from ops dashboards.
 */

import { and, eq, sql, type SQL } from 'drizzle-orm';
import { bookings, customers } from '@/src/db/schema';
import { customerOccupiedTodayExistsSql } from '@/src/lib/occupancySsot';

export function isProductionCustomerFilter(): SQL {
  return eq(customers.isTest, false);
}

export function isProductionBookingFilter(): SQL {
  return eq(bookings.isTest, false);
}

/** Active resident = has a live bed assignment today (occupancy SSOT). */
export function isActiveResidentFilter(): SQL {
  return sql`
    EXISTS (
      SELECT 1
      FROM bookings b
      INNER JOIN bed_reservations br ON br.booking_id = b.id
      WHERE b.customer_id = ${customers.id}
        AND b.status = 'confirmed'
        AND br.status = 'active'
        AND br.kind = 'primary'
        AND CURRENT_DATE <@ br.stay_range
    )
  `;
}

/** Active, non-test residents with confirmed bookings — collections / billing queue. */
export function collectibleResidentFilters(): SQL {
  return and(
    isProductionCustomerFilter(),
    isProductionBookingFilter(),
    isActiveResidentFilter(),
    eq(bookings.status, 'confirmed'),
  )!;
}

export const PRODUCTION_BOOKING_SQL = sql`bk.is_test = false`;
export const PRODUCTION_CUSTOMER_SQL = sql`c.is_test = false`;
/** @deprecated Use customerOccupiedTodayExistsSql — kept for raw SQL queries using alias `c`. */
export const ACTIVE_RESIDENCY_SQL = sql`${customerOccupiedTodayExistsSql}`;
