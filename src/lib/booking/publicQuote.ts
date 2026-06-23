/**
 * Public booking quote helpers — same engine as createBooking() / quoteBookingPrice().
 */

import { todayString } from '@/src/lib/dates';
import {
  quoteBedPrice,
  quoteBookingPrice,
  type BookingQuote,
  type PricingMode,
} from '@/src/services/pricing';

export type PublicBookingQuoteInput = {
  bedIds: string[];
  startDate: string;
  endDate: string | null;
  durationMode: PricingMode;
};

export async function getPublicBookingQuote(
  input: PublicBookingQuoteInput,
): Promise<BookingQuote> {
  return quoteBookingPrice({
    bedIds: input.bedIds,
    startDate: input.startDate,
    endDate: input.endDate,
    durationMode: input.durationMode,
    includeDeposit: true,
  });
}

/** Monthly-stay deposit for bed map / room page — matches createBooking(). */
export async function quoteMonthlyBedDepositPaise(
  bedId: string,
  startDate: string = todayString(),
): Promise<number> {
  const q = await quoteBedPrice({
    bedId,
    startDate,
    endDate: null,
    durationMode: 'open_ended',
    includeDeposit: true,
  });
  return q.depositPaise;
}

export async function enrichBedsWithQuotedMonthlyDeposit<T extends { bedId: string }>(
  beds: T[],
  startDate: string = todayString(),
): Promise<Array<T & { quotedMonthlyDepositPaise: number }>> {
  return Promise.all(
    beds.map(async (bed) => {
      try {
        const quotedMonthlyDepositPaise = await quoteMonthlyBedDepositPaise(bed.bedId, startDate);
        return { ...bed, quotedMonthlyDepositPaise };
      } catch {
        return { ...bed, quotedMonthlyDepositPaise: 0 };
      }
    }),
  );
}
