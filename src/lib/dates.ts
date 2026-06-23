/**
 * Pure date helpers used by the pricing and availability services. Everything
 * here operates in UTC and works on ISO-8601 calendar dates (YYYY-MM-DD) or
 * `Date` objects. The codebase deliberately avoids depending on a date
 * library at this stage — the math is small and easy to test.
 *
 * Half-open ranges (`[start, end)`) are the convention everywhere, matching
 * the Postgres `daterange` type used by `bed_reservations.stay_range`.
 */

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 86_400_000;

export type DateLike = Date | string;

/**
 * Parse YYYY-MM-DD as a UTC midnight Date. Existing Date instances are
 * normalized to their UTC y-m-d component (time-of-day dropped) so downstream
 * math is timezone-free.
 */
export function parseDate(input: DateLike): Date {
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) {
      throw new Error(`Invalid Date passed to parseDate`);
    }
    return new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()));
  }
  if (typeof input !== 'string' || !ISO_DATE_RE.test(input)) {
    throw new Error(`Expected YYYY-MM-DD date string, got: ${JSON.stringify(input)}`);
  }
  const [y, m, d] = input.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  // Round-trip catches things like 2026-02-30 (auto-normalizes to Mar 2).
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d
  ) {
    throw new Error(`Calendar date does not exist: ${input}`);
  }
  return date;
}

export function formatDate(date: Date): string {
  const y = date.getUTCFullYear().toString().padStart(4, '0');
  const m = (date.getUTCMonth() + 1).toString().padStart(2, '0');
  const d = date.getUTCDate().toString().padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Days between two dates, computed as `end - start`. Both inputs are first
 * normalized to UTC midnight, so DST transitions cannot perturb the result.
 */
export function diffDays(start: DateLike, end: DateLike): number {
  const s = parseDate(start);
  const e = parseDate(end);
  return Math.round((e.getTime() - s.getTime()) / MS_PER_DAY);
}

/** Normalize ISO timestamps or date strings to YYYY-MM-DD for display + date math. */
export function normalizeIsoDateOnly(value: string | null | undefined): string {
  if (!value) return '';
  const trimmed = value.trim();
  if (ISO_DATE_RE.test(trimmed)) return trimmed;
  const datePart = trimmed.slice(0, 10);
  if (ISO_DATE_RE.test(datePart)) return datePart;
  return trimmed;
}

/** Coerce Date | ISO string to ISO timestamp for RSC/client props — never throws. */
export function toIsoTimestampSafe(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const d = new Date(trimmed);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

/** Like diffDays but returns null instead of throwing on invalid/missing input. */
export function tryDiffDays(start: DateLike | null | undefined, end: DateLike | null | undefined): number | null {
  if (start == null || end == null) return null;
  if (typeof start === 'string' && !ISO_DATE_RE.test(start.trim())) return null;
  if (typeof end === 'string' && !ISO_DATE_RE.test(end.trim())) return null;
  try {
    return diffDays(start, end);
  } catch {
    return null;
  }
}

export function addDays(date: DateLike, days: number): Date {
  const d = parseDate(date);
  return new Date(d.getTime() + days * MS_PER_DAY);
}

/**
 * Add `n` calendar months. Clamps to month-end when needed so that e.g.
 * `addMonths(2026-01-31, 1) === 2026-02-28` (not Mar 3). Mirrors how humans
 * read monthly billing cycles.
 */
export function addMonths(date: DateLike, n: number): Date {
  const d = parseDate(date);
  const targetMonth = d.getUTCMonth() + n;
  const targetYear = d.getUTCFullYear() + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;
  const day = d.getUTCDate();
  const candidate = new Date(Date.UTC(targetYear, normalizedMonth, day));
  if (candidate.getUTCMonth() !== normalizedMonth) {
    // Day overflowed; clamp to last day of the target month.
    return new Date(Date.UTC(targetYear, normalizedMonth + 1, 0));
  }
  return candidate;
}

export function isBefore(a: DateLike, b: DateLike): boolean {
  return parseDate(a).getTime() < parseDate(b).getTime();
}

export function isAfter(a: DateLike, b: DateLike): boolean {
  return parseDate(a).getTime() > parseDate(b).getTime();
}

export function isSameDay(a: DateLike, b: DateLike): boolean {
  return parseDate(a).getTime() === parseDate(b).getTime();
}

export function maxDate(a: DateLike, b: DateLike): Date {
  return isAfter(a, b) ? parseDate(a) : parseDate(b);
}

export function minDate(a: DateLike, b: DateLike): Date {
  return isBefore(a, b) ? parseDate(a) : parseDate(b);
}

/**
 * Today as a YYYY-MM-DD string in UTC. The system intentionally treats "today"
 * as a calendar date (no timezone) so that occupancy reports are consistent
 * regardless of where the server is running.
 */
export function todayString(now: Date = new Date()): string {
  return formatDate(parseDate(now));
}

/**
 * Sentinel upper bound for open-ended monthly stays in `bed_reservations`.
 * Never surface this to customers as a move-out or pre-book date.
 */
export const OPEN_ENDED_STAY_END = '2099-01-01';

const OPEN_ENDED_CUTOFF = parseDate('2090-01-01');

/** True when a date is the open-ended placeholder, not a real checkout. */
export function isOpenEndedStayEnd(date: string | null | undefined): boolean {
  if (!date) return false;
  try {
    return parseDate(date).getTime() >= OPEN_ENDED_CUTOFF.getTime();
  } catch {
    return false;
  }
}

/** Strip sentinel end dates before showing "available from" on the website. */
export function customerBookableFromDate(date: string | null | undefined): string | null {
  if (!date || isOpenEndedStayEnd(date)) return null;
  return date;
}
