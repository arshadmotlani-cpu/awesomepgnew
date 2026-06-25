import { env } from '@/src/lib/env';

/** SSOT timezone for rent billing anniversary dates. */
export const DEFAULT_BILLING_TIMEZONE = 'Asia/Kolkata';

export function getBillingTimezone(): string {
  return env.BILLING_TIMEZONE ?? DEFAULT_BILLING_TIMEZONE;
}

/** Calendar date YYYY-MM-DD in the billing timezone (default IST). */
export function todayInBillingTimezone(now: Date = new Date()): string {
  const tz = getBillingTimezone();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const y = parts.find((p) => p.type === 'year')?.value ?? '1970';
  const m = parts.find((p) => p.type === 'month')?.value ?? '01';
  const d = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${y}-${m}-${d}`;
}

/** Day-of-month (1–31) for a calendar date in billing timezone. */
export function dayOfMonthInBillingTimezone(now: Date = new Date()): number {
  const iso = todayInBillingTimezone(now);
  return Number(iso.slice(8, 10));
}

/** Next cron run at 00:00 IST ≈ 18:30 UTC previous calendar day. */
export function nextBillingSchedulerRunUtc(now: Date = new Date()): Date {
  const tz = getBillingTimezone();
  const istParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const y = Number(istParts.find((p) => p.type === 'year')?.value ?? 1970);
  const m = Number(istParts.find((p) => p.type === 'month')?.value ?? 1);
  const d = Number(istParts.find((p) => p.type === 'day')?.value ?? 1);
  // Midnight IST on (d+1) in IST = previous day 18:30 UTC
  const nextIstMidnight = new Date(Date.UTC(y, m - 1, d + 1, 18, 30, 0));
  if (nextIstMidnight.getTime() <= now.getTime()) {
    return new Date(nextIstMidnight.getTime() + 86_400_000);
  }
  return nextIstMidnight;
}
