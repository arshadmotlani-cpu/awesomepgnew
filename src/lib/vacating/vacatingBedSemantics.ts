/**
 * Vacating date semantics — SSOT for Awesome PG monthly move-out.
 *
 * Selected vacating date = final occupied day (inclusive).
 * Bed available-from = following calendar day at 12:00 AM in IST (PG local).
 */
import { addDays, formatDate, parseDate, todayString } from '@/src/lib/dates';
import { toIstParts } from '@/src/lib/dates/ist';

/** Normalize to YYYY-MM-DD — the resident's final paid/stay date. */
export function finalStayDate(vacatingDate: string): string {
  return formatDate(parseDate(vacatingDate));
}

/**
 * Half-open `stay_range` upper bound: includes `finalStayDate` as the last occupied day.
 * Example: final stay 15 Aug → exclusive end 16 Aug (`[start, 16 Aug)`).
 */
export function stayRangeExclusiveEnd(vacatingDate: string): string {
  return formatDate(addDays(parseDate(vacatingDate), 1));
}

/** Calendar date when the bed becomes available (12:00 AM IST on this date). */
export function bedAvailableCalendarDate(vacatingDate: string): string {
  return stayRangeExclusiveEnd(vacatingDate);
}

/** Display clock for monthly bed release (not the 11:00 AM short-stay cycle). */
export const BED_AVAILABLE_FROM_CLOCK = '12:00 AM';

export function formatFinalStayDateLabel(vacatingDate: string): string {
  const d = parseDate(finalStayDate(vacatingDate));
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Customer-facing bed-available copy (no year).
 * Example vacate 24 Aug → "25 Aug · 12:00 AM"
 */
export function formatBedAvailableLabel(vacatingDate: string): string {
  const d = parseDate(bedAvailableCalendarDate(vacatingDate));
  const datePart = d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
  return `${datePart} · ${BED_AVAILABLE_FROM_CLOCK}`;
}

/**
 * True when IST calendar date is on or after the available-from date (midnight IST).
 */
export function isBedReleasedForVacating(vacatingDate: string, now?: Date): boolean {
  const availableYmd = bedAvailableCalendarDate(vacatingDate);
  const parts = toIstParts(now ?? new Date());
  return parts.dateYmd >= availableYmd;
}

export type VacatingDateConfirmation = {
  finalStayDateLabel: string;
  bedAvailableLabel: string;
  isTodaySelected: boolean;
  lines: string[];
};

export function buildVacatingDateConfirmation(
  vacatingDate: string,
  today?: string,
): VacatingDateConfirmation {
  const finalStay = finalStayDate(vacatingDate);
  const todayYmd = today ?? todayString();
  const isTodaySelected = finalStay === todayYmd;
  const finalStayDateLabel = formatFinalStayDateLabel(finalStay);
  const bedAvailableLabel = formatBedAvailableLabel(finalStay);
  const lines = [
    `Your final stay date is ${finalStayDateLabel}.`,
    `Your bed will be available from ${bedAvailableLabel}.`,
    `You will be charged rent for ${finalStayDateLabel}.`,
  ];
  if (isTodaySelected) {
    lines.push(
      `You may leave anytime today. Your bed becomes available tomorrow at ${BED_AVAILABLE_FROM_CLOCK}.`,
    );
  }
  return { finalStayDateLabel, bedAvailableLabel, isTodaySelected, lines };
}
