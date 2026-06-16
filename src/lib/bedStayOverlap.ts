/**
 * Canonical half-open stay overlap: [start, end).
 * Two ranges overlap iff existing.start < selected.end AND existing.end > selected.start.
 */
import { formatDate, parseDate, type DateLike } from '@/src/lib/dates';

export type ReservationSpan = { startDate: string; endDate: string };

export function stayRangesOverlap(
  selectedStart: DateLike,
  selectedEnd: DateLike,
  existingStart: DateLike,
  existingEnd: DateLike,
): boolean {
  const ss = parseDate(selectedStart).getTime();
  const se = parseDate(selectedEnd).getTime();
  const es = parseDate(existingStart).getTime();
  const ee = parseDate(existingEnd).getTime();
  return es < se && ee > ss;
}

export function findOverlappingReservations(
  start: DateLike,
  end: DateLike,
  reservations: ReservationSpan[],
): ReservationSpan[] {
  return reservations.filter((r) =>
    stayRangesOverlap(start, end, r.startDate, r.endDate),
  );
}

/** True when [start, end) does not overlap any reservation. */
export function isStayRangeAvailable(
  start: DateLike,
  end: DateLike,
  reservations: ReservationSpan[],
): boolean {
  return findOverlappingReservations(start, end, reservations).length === 0;
}

/** True when `date` falls inside any reservation (half-open [start, end)). */
export function isDateReserved(date: DateLike, reservations: ReservationSpan[]): boolean {
  const t = parseDate(date).getTime();
  return reservations.some((r) => {
    const s = parseDate(r.startDate).getTime();
    const e = parseDate(r.endDate).getTime();
    return t >= s && t < e;
  });
}

/**
 * Latest exclusive check-out for `checkIn` such that [checkIn, checkOut) does not
 * overlap any reservation, capped at `horizonEnd`.
 */
export function maxCheckoutBeforeOverlap(
  checkIn: DateLike,
  reservations: ReservationSpan[],
  horizonEnd: DateLike,
): string | null {
  const ciMs = parseDate(checkIn).getTime();
  let capMs = parseDate(horizonEnd).getTime();
  if (capMs <= ciMs) return null;

  for (const r of reservations) {
    const rsMs = parseDate(r.startDate).getTime();
    const reMs = parseDate(r.endDate).getTime();
    if (reMs > ciMs && rsMs > ciMs && rsMs < capMs) {
      capMs = rsMs;
    }
  }

  if (capMs <= ciMs) return null;
  return formatDate(new Date(capMs));
}

export function isCheckInAvailableForReservations(
  date: DateLike,
  reservations: ReservationSpan[],
  earliestCheckIn: DateLike,
): boolean {
  const d = formatDate(parseDate(date));
  const earliest = formatDate(parseDate(earliestCheckIn));
  if (d < earliest) return false;
  return !isDateReserved(d, reservations);
}

export function isCheckOutAvailableForReservations(
  checkOut: DateLike,
  checkIn: DateLike,
  reservations: ReservationSpan[],
  horizonEnd: DateLike,
): boolean {
  const start = formatDate(parseDate(checkIn));
  const end = formatDate(parseDate(checkOut));
  if (end <= start) return false;
  const cap = maxCheckoutBeforeOverlap(start, reservations, horizonEnd);
  if (!cap || end > cap) return false;
  return isStayRangeAvailable(start, end, reservations);
}

export function isStayRangeAvailableForAllBeds(
  start: DateLike,
  end: DateLike,
  reservationsByBed: ReservationSpan[][],
): boolean {
  return reservationsByBed.every((res) => isStayRangeAvailable(start, end, res));
}

export function maxCheckoutForAllBeds(
  checkIn: DateLike,
  reservationsByBed: ReservationSpan[][],
  horizonEnd: DateLike,
): string | null {
  let cap: string | null = null;
  for (const res of reservationsByBed) {
    const bedCap = maxCheckoutBeforeOverlap(checkIn, res, horizonEnd);
    if (!bedCap) return null;
    if (!cap || bedCap < cap) cap = bedCap;
  }
  return cap;
}

/** Earliest reservation start strictly after `afterDate` (informational, non-blocking). */
export function nextReservationAfter(
  afterDate: DateLike,
  reservations: ReservationSpan[],
): ReservationSpan | null {
  const t = parseDate(afterDate).getTime();
  let next: ReservationSpan | null = null;
  let nextMs = Infinity;
  for (const r of reservations) {
    const rs = parseDate(r.startDate).getTime();
    if (rs >= t && rs < nextMs) {
      nextMs = rs;
      next = r;
    }
  }
  return next;
}
