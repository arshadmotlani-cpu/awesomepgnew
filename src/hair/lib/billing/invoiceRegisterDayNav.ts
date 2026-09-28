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

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** Keep invoice-register bounds ordered. A reversed pair is swapped, never queried as empty. */
export function normalizeInvoiceRegisterDayKeys(
  from?: string,
  to?: string,
): { from?: string; to?: string } {
  const start = from && DAY_KEY.test(from) ? from : undefined;
  const end = to && DAY_KEY.test(to) ? to : undefined;
  if (start && end && start > end) return { from: end, to: start };
  return { from: start, to: end };
}

/**
 * Apply one filter patch onto the latest committed query.
 * Date keys are normalized together so a partial update cannot leave from > to.
 * `nav` increases so an older navigation response can be ignored.
 */
export function applyInvoiceRegisterSearchPatch(
  base: Record<string, string>,
  patch: Record<string, string | undefined>,
): Record<string, string> {
  const next: Record<string, string> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'nav') continue;
    if (value) next[key] = value;
    else delete next[key];
  }
  if ('from' in patch || 'to' in patch) {
    const range = normalizeInvoiceRegisterDayKeys(next.from, next.to);
    if (range.from) next.from = range.from;
    else delete next.from;
    if (range.to) next.to = range.to;
    else delete next.to;
  }
  const prev = Number(base.nav ?? '0');
  next.nav = String(Number.isFinite(prev) ? prev + 1 : 1);
  return next;
}

export function invoiceRegisterSearchHref(params: Record<string, string>): string {
  const qs = new URLSearchParams(params).toString();
  return qs ? `/billing/invoices?${qs}` : '/billing/invoices';
}

/** True when `incoming` is an older navigation than the range the user already committed. */
export function isStaleInvoiceRegisterNavigation(
  committed: Record<string, string>,
  incoming: Record<string, string>,
): boolean {
  return Number(incoming.nav ?? '0') < Number(committed.nav ?? '0');
}
