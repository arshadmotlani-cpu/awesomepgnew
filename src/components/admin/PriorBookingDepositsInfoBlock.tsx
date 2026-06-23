import { paiseToInr } from '@/src/lib/format';
import type { PriorBookingDepositInfo } from '@/src/services/depositCredit';

/** Informational prior-booking deposit rows — does not affect expected payment due. */
export function PriorBookingDepositsInfoBlock({
  deposits,
  variant = 'dark',
}: {
  deposits: PriorBookingDepositInfo[];
  variant?: 'dark' | 'light';
}) {
  if (deposits.length === 0) return null;

  const shell =
    variant === 'dark'
      ? 'rounded-xl border border-amber-400/20 bg-amber-500/5 p-3'
      : 'rounded-lg border border-amber-100 bg-amber-50/80 p-3';
  const titleClass =
    variant === 'dark'
      ? 'text-[11px] font-semibold uppercase tracking-wide text-amber-200'
      : 'text-[11px] font-semibold uppercase tracking-wide text-amber-900';
  const noteClass = variant === 'dark' ? 'text-xs text-apg-silver' : 'text-xs text-amber-900/80';
  const rowLabel = variant === 'dark' ? 'text-apg-silver' : 'text-zinc-600';
  const rowValue = variant === 'dark' ? 'text-white' : 'text-zinc-900';

  return (
    <div className={shell}>
      <p className={titleClass}>Old booking refundable deposit (informational)</p>
      <p className={`mt-1 ${noteClass}`}>
        Does not reduce deposit due on this booking unless admin transferred credit.
      </p>
      <ul className="mt-2 space-y-2">
        {deposits.map((d) => (
          <li
            key={d.bookingId}
            className={`flex flex-wrap items-center justify-between gap-2 text-sm ${rowValue}`}
          >
            <span className={rowLabel}>
              {d.bookingCode ?? 'Prior stay'} · {paiseToInr(d.refundablePaise)}
            </span>
            <span
              className={
                variant === 'dark'
                  ? 'rounded-full bg-white/10 px-2 py-0.5 text-xs font-medium text-amber-100'
                  : 'rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900'
              }
            >
              {d.statusLabel}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
