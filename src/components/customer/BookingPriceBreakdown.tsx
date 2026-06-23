'use client';

import { paiseToInr } from '@/src/lib/format';
import {
  formatRentLineLabel,
  rentLineItemsOnly,
  shouldShowHybridRentBreakdown,
} from '@/src/lib/pricing/formatRentLines';
import type { PricingLineItem } from '@/src/lib/pricing/types';
import type { PriorOutstandingItem } from '@/src/lib/billing/bookingCheckoutTotals';

type Props = {
  rentLineItems?: PricingLineItem[];
  rentSubtotalPaise: number;
  depositRequiredPaise: number;
  depositDueNowPaise: number;
  depositCreditAppliedPaise?: number;
  priorOutstandingItems?: PriorOutstandingItem[];
  newBookingTotalPaise: number;
  totalToCollectTodayPaise: number;
  theme?: 'dark' | 'light';
  compact?: boolean;
};

export function BookingPriceBreakdown({
  rentLineItems = [],
  rentSubtotalPaise,
  depositRequiredPaise,
  depositDueNowPaise,
  depositCreditAppliedPaise = 0,
  priorOutstandingItems = [],
  newBookingTotalPaise,
  totalToCollectTodayPaise,
  theme = 'dark',
  compact = false,
}: Props) {
  const dark = theme === 'dark';
  const rentLines = rentLineItemsOnly(rentLineItems);
  const showHybrid = shouldShowHybridRentBreakdown(rentLineItems);
  const hasPrior = priorOutstandingItems.length > 0;

  const shell = compact
    ? 'space-y-2 text-sm'
    : dark
      ? 'rounded-xl border border-white/10 bg-white/5 p-4 text-sm'
      : 'rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm';

  const muted = dark ? 'text-apg-silver' : 'text-zinc-600';
  const strong = dark ? 'text-white' : 'text-zinc-900';

  return (
    <section className={shell}>
      {!compact ? (
        <h3 className={`text-sm font-semibold ${strong}`}>Price breakdown</h3>
      ) : null}

      {showHybrid && rentLines.length > 0 ? (
        <ul className={`${compact ? '' : 'mt-3'} space-y-1.5`}>
          {rentLines.map((li, i) => (
            <li key={`${li.kind}-${i}`} className={`flex justify-between gap-3 ${muted}`}>
              <span>{formatRentLineLabel(li)}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <dl className={`${compact ? '' : 'mt-3'} space-y-1.5`}>
        {!showHybrid ? (
          <div className="flex justify-between gap-3">
            <dt className={muted}>Rent</dt>
            <dd className={`font-medium ${dark ? 'text-apg-orange' : 'text-indigo-600'}`}>
              {paiseToInr(rentSubtotalPaise)}
            </dd>
          </div>
        ) : (
          <div className="flex justify-between gap-3 font-medium">
            <dt className={muted}>Rent subtotal</dt>
            <dd className={dark ? 'text-apg-orange' : 'text-indigo-600'}>
              {paiseToInr(rentSubtotalPaise)}
            </dd>
          </div>
        )}

        {depositRequiredPaise > 0 ? (
          <div className="flex justify-between gap-3">
            <dt className={muted}>
              {depositCreditAppliedPaise > 0 ? 'Deposit due now (50%)' : 'Deposit (50%)'}
            </dt>
            <dd className={`font-medium ${strong}`}>{paiseToInr(depositDueNowPaise)}</dd>
          </div>
        ) : null}

        {depositCreditAppliedPaise > 0 ? (
          <div className="flex justify-between gap-3 text-xs">
            <dt className={muted}>Deposit wallet credit applied</dt>
            <dd className="text-emerald-400">−{paiseToInr(depositCreditAppliedPaise)}</dd>
          </div>
        ) : null}
      </dl>

      {hasPrior ? (
        <div className={`${compact ? 'mt-2' : 'mt-4'} border-t ${dark ? 'border-white/10' : 'border-zinc-200'} pt-3`}>
          <p className={`text-xs font-semibold uppercase tracking-wide ${muted}`}>
            Outstanding from previous stay
          </p>
          <ul className="mt-2 space-y-1.5">
            {priorOutstandingItems.map((item) => (
              <li key={`${item.bookingId}-${item.kind}-${item.label}`} className="flex justify-between gap-3">
                <span className={muted}>{item.label}</span>
                <span className={`font-medium ${strong}`}>{paiseToInr(item.amountPaise)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div
        className={`${compact ? 'mt-2' : 'mt-4'} space-y-1 border-t ${dark ? 'border-white/10' : 'border-zinc-200'} pt-3`}
      >
        {hasPrior ? (
          <div className={`flex justify-between gap-3 text-xs ${muted}`}>
            <span>New booking total</span>
            <span className={`font-medium ${strong}`}>{paiseToInr(newBookingTotalPaise)}</span>
          </div>
        ) : null}
        <div className={`flex justify-between gap-3 text-base font-bold ${strong}`}>
          <span>{hasPrior ? 'Total to collect today' : 'Total to pay today'}</span>
          <span className="text-apg-orange">{paiseToInr(totalToCollectTodayPaise)}</span>
        </div>
      </div>
    </section>
  );
}
