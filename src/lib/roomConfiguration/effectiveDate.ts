/**
 * Default financial effective date for room configuration changes.
 * Uses next calendar-month billing start (matches calendar_month_1st PG default).
 */
import { addDays, addMonths, formatDate, parseDate, todayString } from '@/src/lib/dates';
import { firstOfMonth } from '@/src/services/billing';

/** Next billing cycle start (1st of next calendar month from today in billing TZ). */
export function defaultRoomConfigurationEffectiveFrom(asOfDate?: string): string {
  const today = asOfDate ?? todayString();
  const monthStart = parseDate(firstOfMonth(today));
  return formatDate(addMonths(monthStart, 1));
}

/** @deprecated Use assertScheduledEffectiveDate — kept for grep/tests migrating off strict "future only". */
export function assertFutureEffectiveDate(effectiveFrom: string, asOfDate?: string): void {
  assertScheduledEffectiveDate(effectiveFrom, asOfDate);
}

/** Scheduled configuration: must be strictly after today (today uses Apply immediately). */
export function assertScheduledEffectiveDate(effectiveFrom: string, asOfDate?: string): void {
  const today = asOfDate ?? todayString();
  if (effectiveFrom < today) {
    throw new Error('Effective date cannot be in the past.');
  }
  if (effectiveFrom <= today) {
    throw new Error(
      'Effective date must be after today for scheduled changes. Use Apply immediately for today.',
    );
  }
}

/** Immediate apply: effective date must equal today (server-enforced). */
export function assertImmediateEffectiveDate(effectiveFrom: string, asOfDate?: string): void {
  const today = asOfDate ?? todayString();
  if (effectiveFrom !== today) {
    throw new Error('Apply immediately requires the effective date to be today.');
  }
}

/** Earliest selectable date for scheduled changes in admin UI (tomorrow). */
export function minScheduledRoomConfigurationEffectiveFrom(asOfDate?: string): string {
  const today = asOfDate ?? todayString();
  return formatDate(addDays(parseDate(today), 1));
}
