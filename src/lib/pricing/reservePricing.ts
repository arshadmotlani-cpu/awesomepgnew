/**
 * Bed reserve pricing SSOT.
 *
 * Daily rent = monthly rent ÷ calendar days in the reserve-start month (28–31).
 * Full reservation = daily rent × reserved days.
 * Customer pays 50% of full reservation (non-refundable hold fee).
 */
import { parseDate } from '@/src/lib/dates';
import { RESERVE_FEE_PERCENT } from '@/src/lib/bedReservePolicy';

export type ReservePricingQuote = {
  monthlyRentPaise: number;
  daysInMonth: number;
  dailyRentPaise: number;
  reservedDays: number;
  /** Full reservation amount before 50% offer. */
  fullReservationPaise: number;
  /** Amount customer pays (50% of full reservation). */
  feePaise: number;
  offerPercent: number;
  savingsPaise: number;
};

/** Calendar days in the month containing `isoDate` (YYYY-MM-DD). */
export function calendarDaysInMonth(isoDate: string): number {
  const d = parseDate(isoDate);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

export function computeReservePricing(input: {
  monthlyRentPaise: number;
  reserveStart: string;
  reservedDays: number;
}): ReservePricingQuote {
  const daysInMonth = calendarDaysInMonth(input.reserveStart);
  const dailyRentPaise =
    daysInMonth > 0 ? Math.round(input.monthlyRentPaise / daysInMonth) : 0;
  const fullReservationPaise = dailyRentPaise * Math.max(0, input.reservedDays);
  const feePaise = Math.round((fullReservationPaise * RESERVE_FEE_PERCENT) / 100);
  const savingsPaise = Math.max(0, fullReservationPaise - feePaise);

  return {
    monthlyRentPaise: input.monthlyRentPaise,
    daysInMonth,
    dailyRentPaise,
    reservedDays: input.reservedDays,
    fullReservationPaise,
    feePaise,
    offerPercent: RESERVE_FEE_PERCENT,
    savingsPaise,
  };
}
