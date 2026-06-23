/**
 * IST (UTC+5:30) helpers for stay checkout timing.
 * Fixed-stay auto-expiry uses 11:00 AM IST on the checkout calendar date.
 */

import { formatDate, parseDate, type DateLike } from '@/src/lib/dates';
import { STAY_CHECK_OUT_TIME } from '@/src/lib/residents/stayBillingRules';

const IST_OFFSET_MS = 330 * 60 * 1000;

/** Checkout hour/minute parsed from STAY_CHECK_OUT_TIME ("11:00 AM"). */
const CHECKOUT_HOUR_IST = 11;
const CHECKOUT_MINUTE_IST = 0;

export type IstDateTimeParts = {
  dateYmd: string;
  hour: number;
  minute: number;
};

/** Current (or given) instant as calendar date + clock in IST. */
export function toIstParts(now: Date = new Date()): IstDateTimeParts {
  const shifted = new Date(now.getTime() + IST_OFFSET_MS);
  return {
    dateYmd: formatDate(
      new Date(
        Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()),
      ),
    ),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
}

function isSameOrAfterCheckoutTime(parts: IstDateTimeParts): boolean {
  if (parts.hour > CHECKOUT_HOUR_IST) return true;
  if (parts.hour < CHECKOUT_HOUR_IST) return false;
  return parts.minute >= CHECKOUT_MINUTE_IST;
}

/**
 * True when IST calendar date is past checkout, or on checkout date at/after 11:00 AM IST.
 */
export function isPastFixedStayCheckout(checkoutDate: DateLike, now?: Date): boolean {
  const checkoutYmd =
    typeof checkoutDate === 'string' ? checkoutDate : formatDate(parseDate(checkoutDate));
  const parts = toIstParts(now ?? new Date());
  if (parts.dateYmd > checkoutYmd) return true;
  if (parts.dateYmd < checkoutYmd) return false;
  return isSameOrAfterCheckoutTime(parts);
}

/** Human-readable unlock time for resident UI. */
export function fixedStayRefundUnlockLabel(checkoutDate: DateLike): string {
  const checkoutYmd =
    typeof checkoutDate === 'string' ? checkoutDate : formatDate(parseDate(checkoutDate));
  const d = parseDate(checkoutYmd);
  const formatted = d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return `Deposit refund available on ${formatted} after ${STAY_CHECK_OUT_TIME}`;
}
