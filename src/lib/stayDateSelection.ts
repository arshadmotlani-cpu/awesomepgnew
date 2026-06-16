/**
 * Pure range-selection logic for stay date pickers (Airbnb-style).
 */
import { addDays, formatDate, parseDate } from '@/src/lib/dates';
import type { FreeWindow } from '@/src/lib/bedAvailabilityWindows';
import { maxCheckoutForCheckIn } from '@/src/lib/bedAvailabilityWindows';

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

export type ReservationSpan = { startDate: string; endDate: string };

/** Whether `date` falls inside any future reservation (half-open [start, end)). */
export function isDateReserved(date: string, reservations: ReservationSpan[]): boolean {
  const t = parseDate(date).getTime();
  return reservations.some((r) => {
    const s = parseDate(r.startDate).getTime();
    const e = parseDate(r.endDate).getTime();
    return t >= s && t < e;
  });
}

/** True when `date` is a valid check-in day across combined free windows. */
export function isCheckInAvailable(
  date: string,
  freeWindows: FreeWindow[],
  earliestCheckIn: string,
): boolean {
  if (date < earliestCheckIn) return false;
  const t = parseDate(date).getTime();
  return freeWindows.some((w) => {
    const s = parseDate(w.startDate).getTime();
    const e = parseDate(w.endDate).getTime();
    return t >= s && t < e;
  });
}

/** True when `date` is a valid check-out day for a given check-in. */
export function isCheckOutAvailable(
  date: string,
  checkIn: string,
  freeWindows: FreeWindow[],
): boolean {
  if (date <= checkIn) return false;
  const cap = maxCheckoutForCheckIn(checkIn, freeWindows);
  if (!cap || date > cap) return false;
  return true;
}

export function classifyDayAvailability(
  date: string,
  opts: {
    freeWindows: FreeWindow[];
    earliestCheckIn: string;
    futureReservations: ReservationSpan[];
    selectedCheckIn: string | null;
  },
): DayAvailabilityKind {
  if (opts.selectedCheckIn && date === maxCheckoutForCheckIn(opts.selectedCheckIn, opts.freeWindows)) {
    return 'checkout-limit';
  }
  if (isDateReserved(date, opts.futureReservations)) return 'reserved';
  const checkInOk = isCheckInAvailable(date, opts.freeWindows, opts.earliestCheckIn);
  const checkOutOk = opts.selectedCheckIn
    ? isCheckOutAvailable(date, opts.selectedCheckIn, opts.freeWindows)
    : false;
  if (checkInOk || checkOutOk) return 'available';
  return 'unavailable';
}

/**
 * Airbnb-style range pick: first click sets start; second click after start sets end;
 * click before start while selecting end resets start; when complete, next click restarts.
 */
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

  // Range already complete — new selection starts over
  if (!canSelect(date, 'start')) return null;
  return { draft: { start: date, end: null }, complete: false };
}

/** Inclusive range highlight for nights between start (inclusive) and end (exclusive checkout). */
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
