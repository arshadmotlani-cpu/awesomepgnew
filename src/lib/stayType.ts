/**
 * User-facing stay types — residents pick dates only; pricing mode is derived.
 * Internal bed_prices still store daily/weekly/monthly rates for the engine.
 */

import { addDays, diffDays, formatDate, parseDate, todayString } from '@/src/lib/dates';
import { formatDate as formatDisplayDate } from '@/src/lib/format';
import type { PricingMode } from '@/src/services/pricing';

export type StayType = 'monthly_stay' | 'fixed_date_stay';

/** Max nights for fixed-date stays; checkout must fall within this window from booking day. */
export const FIXED_DATE_MAX_NIGHTS = 30;

const STAY_TYPES: ReadonlySet<StayType> = new Set(['monthly_stay', 'fixed_date_stay']);

export function isStayType(value: string): value is StayType {
  return STAY_TYPES.has(value as StayType);
}

export function stayTypeLabel(stayType: StayType): string {
  return stayType === 'monthly_stay' ? 'Monthly Stay' : 'Fixed-Date Stay';
}

/** Map user stay type to internal pricing duration mode. */
export function pricingModeFromStayType(stayType: StayType): PricingMode {
  return stayType === 'monthly_stay' ? 'open_ended' : 'fixed_stay';
}

/** Map legacy / internal duration modes to user-facing stay type. */
export function stayTypeFromPricingMode(mode: PricingMode | string): StayType {
  if (mode === 'monthly_stay' || mode === 'fixed_date_stay') return mode;
  if (mode === 'daily' || mode === 'weekly' || mode === 'fixed_stay') return 'fixed_date_stay';
  return 'monthly_stay';
}

export function parseStayTypeParam(raw: string | undefined): StayType | null {
  if (!raw) return null;
  if (isStayType(raw)) return raw;
  if (raw === 'fixed' || raw === 'continue') {
    return raw === 'fixed' ? 'fixed_date_stay' : 'monthly_stay';
  }
  return null;
}

/** Default check-out for fixed-date picker (7 nights from check-in). */
export function defaultFixedDateCheckOut(checkIn: string): string {
  return formatDate(addDays(parseDate(checkIn), 7));
}

/**
 * Validate fixed-date stay dates for customer bookings.
 * Returns a user-facing error message or null when valid.
 */
export function validateFixedDateStay(
  checkIn: string,
  checkOut: string,
  bookingDate?: string,
): string | null {
  const nights = diffDays(parseDate(checkIn), parseDate(checkOut));
  if (nights < 1) {
    return 'Check-out must be after check-in.';
  }
  if (nights > FIXED_DATE_MAX_NIGHTS) {
    return `Fixed-date stays are limited to ${FIXED_DATE_MAX_NIGHTS} nights. Pick a shorter stay or choose Monthly Stay.`;
  }

  const bookDay = bookingDate ?? todayString();
  const maxCheckout = formatDate(addDays(parseDate(bookDay), FIXED_DATE_MAX_NIGHTS));
  if (checkOut > maxCheckout) {
    return `Check-out must be within ${FIXED_DATE_MAX_NIGHTS} days of booking (by ${formatDisplayDate(maxCheckout)}). For longer stays, choose Monthly Stay.`;
  }

  return null;
}
