/**
 * Pure range-selection logic for stay date pickers (Airbnb-style).
 * Blocking availability uses reservation overlap on the selected window only.
 */
import { addDays, formatDate, parseDate } from '@/src/lib/dates';
import {
  isCheckInAvailableForReservations,
  isCheckOutAvailableForReservations,
  isDateReserved,
  maxCheckoutBeforeOverlap,
  type ReservationSpan,
} from '@/src/lib/bedStayOverlap';

export type DayAvailabilityKind =
  | 'available'
  | 'unavailable'
  | 'reserved'
  | 'checkout-limit';

export type RangeDraft = {
  start: string | null;
  end: string | null;
};

export type RangePickResult = {
  draft: RangeDraft;
  complete: boolean;
};

export type { ReservationSpan };

export { isDateReserved };

export function isCheckInAvailable(
  date: string,
  reservations: ReservationSpan[],
  earliestCheckIn: string,
): boolean {
  return isCheckInAvailableForReservations(date, reservations, earliestCheckIn);
}

export function isCheckOutAvailable(
  date: string,
  checkIn: string,
  reservations: ReservationSpan[],
  horizonEnd: string,
): boolean {
  return isCheckOutAvailableForReservations(date, checkIn, reservations, horizonEnd);
}

export function classifyDayAvailability(
  date: string,
  opts: {
    earliestCheckIn: string;
    futureReservations: ReservationSpan[];
    selectedCheckIn: string | null;
    horizonEnd: string;
  },
): DayAvailabilityKind {
  if (opts.selectedCheckIn) {
    const cap = maxCheckoutBeforeOverlap(
      opts.selectedCheckIn,
      opts.futureReservations,
      opts.horizonEnd,
    );
    if (cap && date === cap) return 'checkout-limit';
  }

  if (isDateReserved(date, opts.futureReservations)) return 'reserved';

  const checkInOk = isCheckInAvailable(date, opts.futureReservations, opts.earliestCheckIn);
  const checkOutOk = opts.selectedCheckIn
    ? isCheckOutAvailable(
        date,
        opts.selectedCheckIn,
        opts.futureReservations,
        opts.horizonEnd,
      )
    : false;

  if (checkInOk || checkOutOk) return 'available';
  return 'unavailable';
}

export function pickStayRange(
  draft: RangeDraft,
  date: string,
  canSelect: (date: string, phase: 'start' | 'end') => boolean,
): RangePickResult | null {
  const { start, end } = draft;

  if (!start) {
    if (!canSelect(date, 'start')) return null;
    return { draft: { start: date, end: null }, complete: false };
  }

  if (!end) {
    if (date < start) {
      if (!canSelect(date, 'start')) return null;
      return { draft: { start: date, end: null }, complete: false };
    }
    if (date === start) return null;
    if (!canSelect(date, 'end')) return null;
    return { draft: { start, end: date }, complete: true };
  }

  if (!canSelect(date, 'start')) return null;
  return { draft: { start: date, end: null }, complete: false };
}

export function isInStayRange(
  date: string,
  start: string | null,
  end: string | null,
  hoverEnd?: string | null,
): 'none' | 'start' | 'end' | 'middle' | 'hover-middle' {
  if (!start) return 'none';
  const effectiveEnd = end ?? hoverEnd;
  if (!effectiveEnd) {
    return date === start ? 'start' : 'none';
  }
  const lo = start < effectiveEnd ? start : effectiveEnd;
  const hi = start < effectiveEnd ? effectiveEnd : start;
  if (date === start) return 'start';
  if (end && date === end) return 'end';
  if (date > lo && date < hi) {
    return end ? 'middle' : 'hover-middle';
  }
  return 'none';
}

export function defaultRangeEnd(start: string): string {
  return formatDate(addDays(start, 7));
}
