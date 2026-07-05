import { ReservePriceDisplay } from '@/src/components/customer/ReservePriceDisplay';
import { paiseToInr, formatDate } from '@/src/lib/format';

type Quote = {
  feePaise: number;
  fullReservationPaise: number;
  monthlyRatePaise: number;
  daysInMonth: number;
  dailyRentPaise: number;
  periodDays: number;
  bufferDate: string;
  offerPercent?: number;
  savingsPaise?: number;
};

export function ReserveQuoteBreakdown({
  quote,
  variant = 'dark',
}: {
  quote: Quote;
  variant?: 'light' | 'dark';
}) {
  const labelClass = variant === 'dark' ? 'text-apg-silver' : 'text-zinc-500';
  const valueClass = variant === 'dark' ? 'text-white' : 'text-zinc-900';

  return (
    <dl className="text-sm">
      <div className="flex justify-between">
        <dt className={labelClass}>Monthly rent</dt>
        <dd className={valueClass}>{paiseToInr(quote.monthlyRatePaise)}</dd>
      </div>
      <div className="mt-2 flex justify-between text-xs">
        <dt className={labelClass}>
          Daily rate ({quote.daysInMonth} days in month)
        </dt>
        <dd className={labelClass}>{paiseToInr(quote.dailyRentPaise)}</dd>
      </div>
      <div className="mt-2 flex justify-between text-xs">
        <dt className={labelClass}>{quote.periodDays} reserved days</dt>
        <dd className={labelClass}>{paiseToInr(quote.fullReservationPaise)} full</dd>
      </div>
      <div className="mt-3 border-t border-white/10 pt-3">
        <ReservePriceDisplay
          fullReservationPaise={quote.fullReservationPaise}
          feePaise={quote.feePaise}
          monthlyRentPaise={quote.monthlyRatePaise}
          offerPercent={quote.offerPercent ?? 50}
          variant={variant}
        />
      </div>
      <div className="mt-2 flex justify-between text-xs">
        <dt className={labelClass}>Cleaning buffer</dt>
        <dd className={labelClass}>{formatDate(quote.bufferDate)}</dd>
      </div>
    </dl>
  );
}
