import { paiseToInr } from '@/src/lib/format';

type Props = {
  fullReservationPaise: number;
  feePaise: number;
  monthlyRentPaise?: number;
  offerPercent?: number;
  variant?: 'light' | 'dark';
  className?: string;
};

/** Premium reservation pricing — monthly rent, strikethrough original, 50% offer, savings. */
export function ReservePriceDisplay({
  fullReservationPaise,
  feePaise,
  monthlyRentPaise,
  offerPercent = 50,
  variant = 'light',
  className = '',
}: Props) {
  const savingsPaise = Math.max(0, fullReservationPaise - feePaise);
  const isDark = variant === 'dark';
  const shell = isDark
    ? 'rounded-xl border border-white/10 bg-white/[0.04] p-4'
    : 'rounded-xl border border-zinc-200 bg-zinc-50 p-4';

  return (
    <div className={`${shell} ${className}`}>
      {monthlyRentPaise != null && monthlyRentPaise > 0 ? (
        <p className={`text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-apg-silver' : 'text-zinc-500'}`}>
          Monthly rent
        </p>
      ) : null}
      {monthlyRentPaise != null && monthlyRentPaise > 0 ? (
        <p className={`mt-1 text-lg font-semibold tabular-nums ${isDark ? 'text-white' : 'text-zinc-900'}`}>
          {paiseToInr(monthlyRentPaise)}
        </p>
      ) : null}

      <p className={`mt-3 text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-apg-silver' : 'text-zinc-500'}`}>
        Reservation price
      </p>
      <p className={`mt-1 text-sm line-through tabular-nums ${isDark ? 'text-apg-silver' : 'text-zinc-400'}`}>
        {paiseToInr(fullReservationPaise)}
      </p>
      <p className={`mt-1 text-xs ${isDark ? 'text-apg-silver' : 'text-zinc-600'}`}>
        {offerPercent}% reservation offer
      </p>
      <p className={`mt-2 text-2xl font-bold tabular-nums ${isDark ? 'text-apg-orange' : 'text-[#FF5A1F]'}`}>
        {paiseToInr(feePaise)}
      </p>
      <p className={`mt-2 text-sm font-medium ${isDark ? 'text-emerald-300' : 'text-emerald-700'}`}>
        You save {paiseToInr(savingsPaise)}
      </p>
    </div>
  );
}
