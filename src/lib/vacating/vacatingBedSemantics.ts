/**
 * Vacating date semantics — SSOT for Awesome PG monthly move-out.
 *
 * Selected vacating date = final paid/stay date (inclusive).
 * Physical bed release and new bookings = following calendar day at 11:00 AM IST.
 */
import { addDays, formatDate, parseDate, todayString } from '@/src/lib/dates';
import { isPastFixedStayCheckout } from '@/src/lib/dates/ist';
import { STAY_CHECK_OUT_TIME } from '@/src/lib/residents/stayBillingRules';

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

/** Calendar date when the bed becomes available (at 11:00 AM IST on this date). */
export function bedAvailableCalendarDate(vacatingDate: string): string {
  return stayRangeExclusiveEnd(vacatingDate);
}

export function formatFinalStayDateLabel(vacatingDate: string): string {
  const d = parseDate(finalStayDate(vacatingDate));
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function formatBedAvailableLabel(vacatingDate: string): string {
  const d = parseDate(bedAvailableCalendarDate(vacatingDate));
  const datePart = d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return `${datePart} at ${STAY_CHECK_OUT_TIME}`;
}

/**
 * True when IST is on or after the bed-available calendar date at 11:00 AM.
 */
export function isBedReleasedForVacating(vacatingDate: string, now?: Date): boolean {
  return isPastFixedStayCheckout(bedAvailableCalendarDate(vacatingDate), now);
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
      `You may leave anytime today. Your bed becomes available tomorrow at ${STAY_CHECK_OUT_TIME}.`,
    );
  }
  return { finalStayDateLabel, bedAvailableLabel, isTodaySelected, lines };
}
