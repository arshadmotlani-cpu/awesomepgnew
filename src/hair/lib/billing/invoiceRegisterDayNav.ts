import { addDays, formatDate, parseDate } from '@/src/lib/dates';

const DAY_ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Shift a calendar day (YYYY-MM-DD) without browser timezone drift. */
export function shiftInvoiceRegisterDayIso(dayIso: string, deltaDays: number): string {
  if (!DAY_ISO_RE.test(dayIso)) {
    throw new Error(`Expected YYYY-MM-DD, got: ${dayIso}`);
  }
  return formatDate(addDays(parseDate(dayIso), deltaDays));
}

/**
 * Previous/next single-day navigation for Invoice Register.
 * Single-day: move both bounds together. Multi-day: collapse to one day before start or after end.
 */
export function invoiceRegisterNavigateDay(input: {
  from?: string;
  to?: string;
  direction: -1 | 1;
  fallbackDayIso: string;
}): { from: string; to: string } {
  const from = input.from?.trim();
  const to = input.to?.trim();
  const fallback = input.fallbackDayIso.trim();
  const anchor =
    input.direction === -1
      ? from || to || fallback
      : to || from || fallback;
  const day = shiftInvoiceRegisterDayIso(anchor, input.direction);
  return { from: day, to: day };
}
