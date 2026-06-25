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

/** Customer-facing stay type label (summary, checkout). */
export function stayTypeLabel(stayType: StayType): string {
  return stayType === 'monthly_stay' ? 'Live here (Monthly)' : 'Short Stay';
}

/** Short subtitle under stay type on cards and summary. */
export function stayTypeSubtitle(stayType: StayType): string {
  return stayType === 'monthly_stay'
    ? 'Stay until you decide to leave'
    : 'Fixed check-in and check-out dates';
}

/** Admin / ops label — distinct from customer copy. */
export function adminStayTypeLabel(input: {
  stayType?: StayType | string | null;
  durationMode?: string | null;
}): string {
  const stay =
    input.stayType && isStayType(String(input.stayType))
      ? (input.stayType as StayType)
      : stayTypeFromPricingMode(input.durationMode ?? 'open_ended');
  return stay === 'monthly_stay' ? 'Monthly' : 'Fixed date';
}

export function stayTypeBillingTag(stayType: StayType): string {
  return stayType === 'monthly_stay' ? 'Monthly billing' : 'Automatic pricing';
}

export function stayTypeChoiceDescription(stayType: StayType): string {
  if (stayType === 'monthly_stay') {
    return 'Choose your check-in date. Stay until you decide to leave. Submit a move-out request whenever you\'re ready.';
  }
  return 'Choose your check-in and check-out dates. We\'ll calculate everything automatically.';
}

export function isMonthlyStayType(stayType: StayType | string | null | undefined): boolean {
  if (!stayType) return false;
  if (stayType === 'monthly_stay') return true;
  if (stayType === 'fixed_date_stay') return false;
  return stayTypeFromPricingMode(stayType) === 'monthly_stay';
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
    return `Fixed-date stays are limited to ${FIXED_DATE_MAX_NIGHTS} nights. Pick a shorter stay or choose Live here (Monthly).`;
  }

  const bookDay = bookingDate ?? todayString();
  const maxCheckout = formatDate(addDays(parseDate(bookDay), FIXED_DATE_MAX_NIGHTS));
  if (checkOut > maxCheckout) {
    return `Check-out must be within ${FIXED_DATE_MAX_NIGHTS} days of booking (by ${formatDisplayDate(maxCheckout)}). For longer stays, choose Live here (Monthly).`;
  }

  return null;
}
