/**
 * User-facing stay types — residents pick dates only; pricing mode is derived.
 * Internal bed_prices still store daily/weekly/monthly rates for the engine.
 */

import { addDays, diffDays, formatDate, parseDate, todayString } from '@/src/lib/dates';
import { formatDate as formatDisplayDate } from '@/src/lib/format';
import type { PricingMode } from '@/src/services/pricing';

export type StayType = 'monthly_stay' | 'fixed_date_stay';

/** Max nights for fixed-date stays; checkout must fall within this window from booking day. */
export const FIXED_DATE_MAX_NIGHTS = 29;

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
  return stayTypeBusinessLabel(input, 'admin');
}

export type StayLabelAudience = 'customer' | 'admin' | 'ops';

/** Unified business stay type labels — never expose internal workflow terms. */
export function stayTypeBusinessLabel(
  input: {
    stayType?: StayType | string | null;
    durationMode?: string | null;
  },
  audience: StayLabelAudience = 'admin',
): string {
  const mode = input.durationMode ?? null;
  if (mode === 'reserve') return 'Bed Hold';

  if (mode === 'daily') return 'Daily Stay';
  if (mode === 'weekly') return 'Weekly Stay';

  const stay =
    input.stayType && isStayType(String(input.stayType))
      ? (input.stayType as StayType)
      : stayTypeFromPricingMode(mode ?? 'open_ended');

  if (stay === 'monthly_stay') {
    return audience === 'customer' ? 'Live here (Monthly)' : 'Monthly Stay';
  }
  return audience === 'customer' ? 'Short Stay' : 'Short Stay';
}

/** Payment category label (separate from stay type). */
export function paymentCategoryBusinessLabel(kind: string): string {
  switch (kind) {
    case 'rent':
      return 'Rent collection';
    case 'electricity':
      return 'Electricity';
    case 'extension':
      return 'Extension';
    case 'deposit_link':
      return 'Deposit collection';
    case 'qr':
      return 'New stay payment';
    default:
      return 'Payment';
  }
}

/** Admin-facing booking lifecycle status — no raw enum values. */
export function adminBookingStatusLabel(status: string | null | undefined): string {
  if (!status) return 'Unknown';
  switch (status) {
    case 'draft':
      return 'Draft';
    case 'pending_payment':
      return 'Awaiting payment';
    case 'pending_approval':
      return 'Awaiting review';
    case 'confirmed':
      return 'Confirmed';
    case 'completed':
      return 'Completed';
    case 'cancelled':
      return 'Cancelled';
    case 'superseded':
      return 'Superseded';
    case 'refunded':
      return 'Refunded';
    default:
      return status.replace(/_/g, ' ');
  }
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
