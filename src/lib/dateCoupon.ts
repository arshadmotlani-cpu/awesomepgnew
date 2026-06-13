/**
 * Date-based rent coupon: code = DDMMYY for a calendar day in Asia/Kolkata.
 * 10% off rent (subtotal) only — deposit and other charges unchanged.
 */

export const DATE_COUPON_TIMEZONE = 'Asia/Kolkata';
export const DATE_COUPON_DISCOUNT_PCT = 10;
export const DATE_COUPON_CODE_RE = /^\d{6}$/;

export type DateCouponSnapshot = {
  code: string;
  couponDate: string;
  discountPct: number;
  discountPaise: number;
  appliedAt: string;
};

export type DateCouponValidation =
  | { status: 'active'; code: string; couponDate: string }
  | { status: 'invalid' }
  | { status: 'expired' }
  | { status: 'not_yet_active' };

function calendarPartsInTimeZone(date: Date, timeZone: string): { day: number; month: number; year: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(date);
  const day = Number(parts.find((p) => p.type === 'day')?.value);
  const month = Number(parts.find((p) => p.type === 'month')?.value);
  const year = Number(parts.find((p) => p.type === 'year')?.value);
  return { day, month, year };
}

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

/** ISO date (YYYY-MM-DD) for the given instant in IST. */
export function couponCalendarDate(now: Date = new Date()): string {
  const { day, month, year } = calendarPartsInTimeZone(now, DATE_COUPON_TIMEZONE);
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/** Auto-generated coupon for a calendar day in IST. */
export function generateDateCouponCode(now: Date = new Date()): string {
  const { day, month, year } = calendarPartsInTimeZone(now, DATE_COUPON_TIMEZONE);
  return `${pad2(day)}${pad2(month)}${year.toString().slice(-2)}`;
}

/** Yesterday's code in IST (read-only admin log). */
export function generateYesterdayDateCouponCode(now: Date = new Date()): string {
  const yesterday = new Date(now.getTime() - 86_400_000);
  return generateDateCouponCode(yesterday);
}

function parseCouponCode(code: string): { day: number; month: number; year: number } | null {
  const trimmed = code.trim();
  if (!DATE_COUPON_CODE_RE.test(trimmed)) return null;
  const day = Number(trimmed.slice(0, 2));
  const month = Number(trimmed.slice(2, 4));
  const year = 2000 + Number(trimmed.slice(4, 6));
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }
  return { day, month, year };
}

function couponDateFromParts(parts: { day: number; month: number; year: number }): string {
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
}

/** Full validation — admin may use expired/not_yet; customer UI only sees active vs invalid. */
export function validateDateCoupon(code: string, now: Date = new Date()): DateCouponValidation {
  const parts = parseCouponCode(code);
  if (!parts) return { status: 'invalid' };

  const couponDate = couponDateFromParts(parts);
  const today = couponCalendarDate(now);
  const normalizedCode = `${pad2(parts.day)}${pad2(parts.month)}${parts.year.toString().slice(-2)}`;

  if (couponDate === today) {
    return { status: 'active', code: normalizedCode, couponDate };
  }
  if (couponDate < today) return { status: 'expired' };
  return { status: 'not_yet_active' };
}

/** Customer-facing: active only; everything else is generic invalid. */
export function validateDateCouponForCheckout(code: string, now: Date = new Date()): boolean {
  const trimmed = code.trim();
  if (!trimmed) return false;
  return validateDateCoupon(trimmed, now).status === 'active';
}

export function rentDiscountPaise(rentSubtotalPaise: number): number {
  if (rentSubtotalPaise <= 0) return 0;
  return Math.round((rentSubtotalPaise * DATE_COUPON_DISCOUNT_PCT) / 100);
}

export function applyDateCouponToRentSubtotal(
  rentSubtotalPaise: number,
  code: string | undefined | null,
  now: Date = new Date(),
):
  | { ok: true; discountPaise: number; netRentPaise: number; coupon: DateCouponSnapshot }
  | { ok: false; error: 'invalid_coupon' }
  | { ok: true; discountPaise: 0; netRentPaise: number; coupon: null } {
  const trimmed = code?.trim() ?? '';
  if (!trimmed) {
    return { ok: true, discountPaise: 0, netRentPaise: rentSubtotalPaise, coupon: null };
  }

  const validation = validateDateCoupon(trimmed, now);
  if (validation.status !== 'active') {
    return { ok: false, error: 'invalid_coupon' };
  }

  const discountPaise = rentDiscountPaise(rentSubtotalPaise);
  return {
    ok: true,
    discountPaise,
    netRentPaise: rentSubtotalPaise - discountPaise,
    coupon: {
      code: validation.code,
      couponDate: validation.couponDate,
      discountPct: DATE_COUPON_DISCOUNT_PCT,
      discountPaise,
      appliedAt: now.toISOString(),
    },
  };
}
