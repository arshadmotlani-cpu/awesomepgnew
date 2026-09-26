/**
 * Default financial effective date for room configuration changes.
 * Uses next calendar-month billing start (matches calendar_month_1st PG default).
 */
import { addMonths, formatDate, parseDate, todayString } from '@/src/lib/dates';
import { firstOfMonth } from '@/src/services/billing';

/** Next billing cycle start (1st of next calendar month from today in billing TZ). */
export function defaultRoomConfigurationEffectiveFrom(asOfDate?: string): string {
  const today = asOfDate ?? todayString();
  const monthStart = parseDate(firstOfMonth(today));
  return formatDate(addMonths(monthStart, 1));
}

export function assertFutureEffectiveDate(effectiveFrom: string, asOfDate?: string): void {
  const today = asOfDate ?? todayString();
  if (effectiveFrom <= today) {
    throw new Error('Effective date must be after today.');
  }
}
