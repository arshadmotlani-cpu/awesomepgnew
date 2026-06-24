/**
 * Single source of truth for customer booking funnel dates (URL → form → create).
 */

import { diffDays, parseDate } from '@/src/lib/dates';
import { pricingModeFromStayType, validateFixedDateStay, type StayType } from '@/src/lib/stayType';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type BookingFunnelDates = {
  start: string;
  end: string | null;
  stayType: StayType;
  stayNights: number | null;
};

export function bookingFunnelDatesFromParams(input: {
  start: string;
  end: string | null;
  stayType: StayType;
}): BookingFunnelDates {
  const stayNights =
    input.stayType === 'fixed_date_stay' && input.end
      ? diffDays(parseDate(input.start), parseDate(input.end))
      : null;
  return {
    start: input.start,
    end: input.stayType === 'monthly_stay' ? null : input.end,
    stayType: input.stayType,
    stayNights,
  };
}

/** Returns a user-facing error when dates are invalid for booking — blocks checkout. */
export function validateBookingFunnelDates(input: {
  start: string;
  end: string | null;
  stayType: StayType;
}): string | null {
  if (!ISO_DATE_RE.test(input.start)) {
    return 'Check-in date is missing or invalid.';
  }
  if (input.stayType === 'fixed_date_stay') {
    if (!input.end || !ISO_DATE_RE.test(input.end)) {
      return 'Check-out date is missing or invalid.';
    }
    return validateFixedDateStay(input.start, input.end);
  }
  return null;
}

export function bookingNewSearchParams(input: {
  bedIds: string[];
  start: string;
  end: string | null;
  stayType: StayType;
}): URLSearchParams {
  const params = new URLSearchParams();
  params.set('start', input.start);
  if (input.stayType === 'fixed_date_stay' && input.end) {
    params.set('end', input.end);
    params.set('stayType', 'fixed_date_stay');
    params.set('mode', pricingModeFromStayType('fixed_date_stay'));
  } else {
    params.set('stayType', 'monthly_stay');
    params.set('mode', pricingModeFromStayType('monthly_stay'));
  }
  for (const bedId of input.bedIds) {
    params.append('bed', bedId);
  }
  return params;
}
