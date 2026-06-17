/**
 * Shared SQL fragments for occupant visibility on bed maps.
 * Customer alias: `c`, booking alias: `bk`.
 */

import { sql } from 'drizzle-orm';
import { customerIsVerifiedSql } from '@/src/lib/residentVerification';

export const OCCUPANCY_PLACEHOLDER_PHONE = '+910000000001';
export const OCCUPANCY_PLACEHOLDER_EMAIL = 'occupancy@awesomepg.internal';
export const OCCUPANCY_PLACEHOLDER_NAME = 'Occupancy placeholder';

/** Exclude internal occupancy marker customers from resident/admin lists. */
export const isNotOccupancyPlaceholderCustomerSql = sql`(
  c.phone <> ${OCCUPANCY_PLACEHOLDER_PHONE}
  AND c.email <> ${OCCUPANCY_PLACEHOLDER_EMAIL}
  AND c.full_name <> ${OCCUPANCY_PLACEHOLDER_NAME}
)`;

/** Drizzle-friendly filter on customers table (no alias). */
export function isOccupancyPlaceholderPhone(phone: string): boolean {
  return phone === OCCUPANCY_PLACEHOLDER_PHONE;
}

export function isOccupancyPlaceholderEmail(email: string): boolean {
  return email.toLowerCase() === OCCUPANCY_PLACEHOLDER_EMAIL;
}

export function isOccupancyPlaceholderCustomer(input: {
  phone?: string | null;
  email?: string | null;
  fullName?: string | null;
}): boolean {
  return (
    input.phone === OCCUPANCY_PLACEHOLDER_PHONE ||
    input.email?.toLowerCase() === OCCUPANCY_PLACEHOLDER_EMAIL ||
    input.fullName === OCCUPANCY_PLACEHOLDER_NAME
  );
}

/** Booking has verified payment, deposit collection, admin assignment, or is a placeholder marker. */
export const bookingHasVerifiedPaymentSql = sql`(
  bk.created_via = 'admin'
  OR EXISTS (
    SELECT 1 FROM payments p
    WHERE p.booking_id = bk.id
      AND p.status = 'succeeded'
      AND p.amount_paise > 0
  )
  OR EXISTS (
    SELECT 1 FROM deposit_ledger dl
    WHERE dl.booking_id = bk.id
      AND dl.entry_kind = 'collected'
  )
  OR bk.notes ILIKE '%occupancy placeholder%'
  OR bk.notes ILIKE '%Full occupancy marker%'
  OR bk.pricing_snapshot::text ILIKE '%Occupancy placeholder%'
)`;

/** KYC policy: verified customer or internal occupancy placeholder. */
export const customerMeetsOccupancyKycPolicySql = sql`(
  ${customerIsVerifiedSql}
  OR c.phone = ${OCCUPANCY_PLACEHOLDER_PHONE}
  OR c.email = ${OCCUPANCY_PLACEHOLDER_EMAIL}
)`;
