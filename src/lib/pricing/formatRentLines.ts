import { paiseToInr } from '@/src/lib/format';
import type { PricingLineItem } from '@/src/lib/pricing/types';

/** Human-readable rent line for checkout UI (excludes deposit lines). */
export function formatRentLineLabel(item: PricingLineItem): string {
  const unit = paiseToInr(item.unitPricePaise);
  const total = paiseToInr(item.amountPaise);

  if (item.kind === 'weekly_cycle') {
    const unitWord = item.units === 1 ? 'week' : 'weeks';
    return `${item.units} ${unitWord} × ${unit} = ${total}`;
  }
  if (item.kind === 'daily_nights') {
    const unitWord = item.units === 1 ? 'day' : 'days';
    return `${item.units} ${unitWord} × ${unit} = ${total}`;
  }
  if (item.kind === 'monthly_cycle') {
    const unitWord = item.units === 1 ? 'month' : 'months';
    return `${item.units} ${unitWord} × ${unit} = ${total}`;
  }
  if (item.kind === 'pro_rata_days') {
    const unitWord = item.units === 1 ? 'day' : 'days';
    return `${item.units} pro-rata ${unitWord} × ${unit} = ${total}`;
  }
  return `${item.description} — ${total}`;
}

export function rentLineItemsOnly(items: PricingLineItem[]): PricingLineItem[] {
  return items.filter((li) => li.kind !== 'deposit');
}

/** Show hybrid week+daily breakdown only when both weekly and daily rent lines exist. */
export function shouldShowHybridRentBreakdown(items: PricingLineItem[]): boolean {
  const rent = rentLineItemsOnly(items);
  const hasWeekly = rent.some((li) => li.kind === 'weekly_cycle');
  const hasDaily = rent.some((li) => li.kind === 'daily_nights');
  return hasWeekly && hasDaily;
}
