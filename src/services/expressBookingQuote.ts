/**
 * Express Booking POS — server-side quote via pricing SSOT.
 */

import { diffDays, todayString } from '@/src/lib/dates';
import type { PricingMode } from '@/src/services/pricing';
import { quoteBookingPrice } from '@/src/services/pricing';

export type ExpressBookingStayType = 'fixed' | 'continue';

export type ExpressBookingQuoteInput = {
  bedId: string;
  checkInDate: string;
  checkOutDate?: string | null;
  stayType: ExpressBookingStayType;
};

export type ExpressBookingQuote = {
  stayType: ExpressBookingStayType;
  checkInDate: string;
  checkOutDate: string | null;
  isHistorical: boolean;
  days: number;
  rentPaise: number;
  depositPaise: number;
  totalPaise: number;
  dailyRatePaise: number;
  monthlyRentPaise: number;
};

export function isHistoricalCheckIn(checkInDate: string, now: Date = new Date()): boolean {
  return checkInDate < todayString(now);
}

export async function quoteExpressBooking(
  input: ExpressBookingQuoteInput,
): Promise<ExpressBookingQuote> {
  const durationMode: PricingMode =
    input.stayType === 'continue' ? 'open_ended' : 'fixed_stay';
  const includeDeposit = input.stayType === 'continue';

  if (input.stayType === 'fixed' && !input.checkOutDate?.trim()) {
    throw new Error('Check-out date is required for fixed stays.');
  }

  const endDate =
    input.stayType === 'continue'
      ? input.checkInDate
      : (input.checkOutDate ?? input.checkInDate);

  const quote = await quoteBookingPrice({
    bedIds: [input.bedId],
    startDate: input.checkInDate,
    endDate: input.stayType === 'continue' ? input.checkInDate : endDate,
    durationMode,
    includeDeposit,
  });

  const days =
    input.stayType === 'fixed' && input.checkOutDate
      ? Math.max(0, diffDays(input.checkInDate, input.checkOutDate))
      : 0;

  const rentPaise = quote.subtotalPaise;
  const dailyRatePaise = days > 0 ? Math.round(rentPaise / days) : 0;
  const monthlyRentPaise =
    input.stayType === 'continue'
      ? quote.perBed[0]?.rate.monthlyRatePaise ?? rentPaise
      : 0;

  return {
    stayType: input.stayType,
    checkInDate: input.checkInDate,
    checkOutDate: input.stayType === 'fixed' ? (input.checkOutDate ?? null) : null,
    isHistorical: isHistoricalCheckIn(input.checkInDate),
    days,
    rentPaise,
    depositPaise: includeDeposit ? quote.depositPaise : 0,
    totalPaise: includeDeposit ? quote.totalPaise : rentPaise,
    dailyRatePaise,
    monthlyRentPaise,
  };
}
