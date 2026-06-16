'use client';

import { paiseToInr } from '@/src/lib/format';
import type { LineItem } from '@/src/services/pricing';

export type PricingBreakdownProps = {
  rentLineItems: LineItem[];
  rentSubtotalPaise: number;
  depositPaise: number;
  ps4Paise?: number;
  couponDiscountPaise?: number;
  grandTotalPaise: number;
  lowestPriceApplied?: boolean;
  durationMode?: string;
  compact?: boolean;
};

function rentLinesOnly(items: LineItem[]): LineItem[] {
  return items.filter((li) => li.kind !== 'deposit');
}

/**
 * Transparent pricing breakdown for checkout — every rupee explained.
 */
export function PricingBreakdown({
  rentLineItems,
  rentSubtotalPaise,
  depositPaise,
  ps4Paise = 0,
  couponDiscountPaise = 0,
  grandTotalPaise,
  lowestPriceApplied,
  durationMode,
  compact = false,
}: PricingBreakdownProps) {
  const lines = rentLinesOnly(rentLineItems);

  return (
    <section
      className={
        compact
          ? 'space-y-2 text-sm'
          : 'rounded-xl border border-zinc-200 bg-zinc-50/80 p-4 text-sm'
      }
    >
      {!compact ? (
        <h3 className="text-sm font-semibold text-zinc-900">Pricing breakdown</h3>
      ) : null}

      {durationMode === 'fixed_stay' || lowestPriceApplied ? (
        <p className="text-xs leading-relaxed text-emerald-800">
          We automatically calculate the lowest available price for your selected stay
          duration.
          {lowestPriceApplied ? (
            <span className="mt-1 block font-medium">
              Lowest available stay price automatically applied.
            </span>
          ) : null}
        </p>
      ) : null}

      <ul className="space-y-2">
        {lines.map((li, i) => (
          <li key={`${li.kind}-${i}`} className="flex justify-between gap-3">
            <span className="text-zinc-700">{formatLineLabel(li)}</span>
            <span className="font-medium text-zinc-900">{paiseToInr(li.amountPaise)}</span>
          </li>
        ))}
      </ul>

      <dl className="space-y-1.5 border-t border-zinc-200 pt-3">
        <div className="flex justify-between font-medium text-zinc-900">
          <dt>Rent total</dt>
          <dd>{paiseToInr(rentSubtotalPaise)}</dd>
        </div>
        {couponDiscountPaise > 0 ? (
          <div className="flex justify-between text-emerald-700">
            <dt>Promo discount</dt>
            <dd>−{paiseToInr(couponDiscountPaise)}</dd>
          </div>
        ) : null}
        <div className="flex justify-between text-zinc-700">
          <dt>Refundable deposit</dt>
          <dd>{paiseToInr(depositPaise)}</dd>
        </div>
        {ps4Paise > 0 ? (
          <div className="flex justify-between text-zinc-700">
            <dt>PS4 add-on</dt>
            <dd>{paiseToInr(ps4Paise)}</dd>
          </div>
        ) : null}
        <div className="flex justify-between border-t border-zinc-300 pt-2 text-base font-semibold text-zinc-900">
          <dt>Grand total</dt>
          <dd>{paiseToInr(grandTotalPaise)}</dd>
        </div>
      </dl>
    </section>
  );
}

function formatLineLabel(li: LineItem): string {
  if (li.kind === 'weekly_cycle') {
    return `${li.units} Week${li.units === 1 ? '' : 's'} Stay`;
  }
  if (li.kind === 'daily_nights') {
    return `${li.units} Extra Day${li.units === 1 ? '' : 's'}`;
  }
  if (li.kind === 'monthly_cycle') {
    return li.description.includes('open-ended')
      ? '1 Month Upfront'
      : `${li.units} Month${li.units === 1 ? '' : 's'}`;
  }
  if (li.kind === 'pro_rata_days') {
    return `${li.units} Pro-rata Day${li.units === 1 ? '' : 's'}`;
  }
  return li.description;
}
