/**
 * Sensible default dates for browse, booking, extension, vacating, and billing
 * forms. Centralised here so every surface picks the same conventions.
 */
import { addDays, formatDate, parseDate, todayString, type DateLike } from './dates';
import type { PricingMode } from '@/src/services/pricing';
import { VACATING_NOTICE_MIN_DAYS } from '@/src/services/billing';

export const DEFAULT_STAY_NIGHTS = 30;
export const DEFAULT_EXTENSION_DAYS = 7;
export { VACATING_NOTICE_MIN_DAYS, VACATING_NOTICE_MIN_DAYS as DEFAULT_VACATING_NOTICE_DAYS };

const VALID_MODES: ReadonlySet<PricingMode> = new Set([
  'daily',
  'weekly',
  'monthly',
  'open_ended',
]);

export type BrowseStayParams = {
  start?: string;
  end?: string;
  mode?: string;
};

export type NormalizedStay = {
  start: string;
  end: string;
  mode: PricingMode;
};

/** Default check-out for a new stay starting on `start` (30 nights). */
export function defaultCheckOutDate(start: DateLike = todayString()): string {
  return formatDate(addDays(start, DEFAULT_STAY_NIGHTS));
}

/**
 * Suggested new check-out when extending: current checkout + 7 days
 * (always strictly after the current checkout).
 */
export function defaultExtensionUntilDate(currentCheckout: DateLike): string {
  const minUntil = formatDate(addDays(currentCheckout, 1));
  const preferred = formatDate(addDays(currentCheckout, DEFAULT_EXTENSION_DAYS));
  return preferred > minUntil ? preferred : minUntil;
}

/** Default vacating date: today + notice period (meets policy). */
export function defaultVacatingDate(from: DateLike = todayString()): string {
  return formatDate(addDays(from, VACATING_NOTICE_MIN_DAYS));
}

/** YYYY-MM-01 for the calendar month containing `date`. */
export function defaultBillingMonth(from: DateLike = todayString()): string {
  const d = parseDate(from);
  return formatDate(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)));
}

/**
 * Normalise browse/booking date query params. Invalid or missing values fall
 * back to today / today+30 / monthly so date pickers are never empty.
 */
export function normalizeBrowseStay(sp: BrowseStayParams): NormalizedStay {
  const today = todayString();
  const fallbackEnd = defaultCheckOutDate(today);

  let start = sp.start ?? today;
  let end = sp.end ?? fallbackEnd;
  let mode: PricingMode = VALID_MODES.has(sp.mode as PricingMode)
    ? (sp.mode as PricingMode)
    : 'monthly';

  try {
    parseDate(start);
  } catch {
    start = today;
  }
  try {
    parseDate(end);
  } catch {
    end = fallbackEnd;
  }
  if (parseDate(end).getTime() <= parseDate(start).getTime()) {
    end = defaultCheckOutDate(start);
  }
  return { start, end, mode };
}

/** Query string fragment for default PG browse dates (today → +30 days, monthly). */
export function defaultBrowseStayQuery(): string {
  const stay = normalizeBrowseStay({});
  return `start=${stay.start}&end=${stay.end}&mode=${stay.mode}`;
}
