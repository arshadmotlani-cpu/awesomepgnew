import { formatDate, parseDate } from '@/src/lib/dates';
import { defaultBillingMonth, resolveBillingMonth } from '@/src/lib/dateDefaults';

export function shiftBillingMonth(billingMonth: string, deltaMonths: number): string {
  const d = parseDate(resolveBillingMonth(billingMonth));
  return formatDate(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + deltaMonths, 1)));
}

export function isCurrentBillingMonth(billingMonth: string): boolean {
  return resolveBillingMonth(billingMonth) === defaultBillingMonth();
}

export function formatBillingMonthLabel(billingMonth: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${resolveBillingMonth(billingMonth)}T00:00:00.000Z`));
}

export function billingMonthQueryParam(billingMonth: string): string {
  return resolveBillingMonth(billingMonth).slice(0, 7);
}
