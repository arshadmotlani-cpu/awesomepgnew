/**
 * Fixed-stay rent optimizer — evaluates every valid pricing combination and
 * returns the lowest legal total. Used by the pricing SSOT in pricing.ts.
 */

import type { FixedStayPricingStrategy, PricingLineItem } from '@/src/lib/pricing/types';

export type { FixedStayPricingStrategy } from '@/src/lib/pricing/types';

export type LowestFixedStayQuote = {
  subtotalPaise: number;
  lineItems: PricingLineItem[];
  strategy: FixedStayPricingStrategy;
  lowestPriceApplied: boolean;
  units: number;
};

type Candidate = LowestFixedStayQuote & { label: string };

function rentLineItems(
  weeklyUnits: number,
  weeklyRate: number,
  dailyUnits: number,
  dailyRate: number,
  monthlyUnits = 0,
  monthlyRate = 0,
  proRataUnits = 0,
  proRataRate = 0,
): PricingLineItem[] {
  const items: PricingLineItem[] = [];
  if (monthlyUnits > 0 && monthlyRate > 0) {
    items.push({
      kind: 'monthly_cycle',
      description: `${monthlyUnits} month${monthlyUnits === 1 ? '' : 's'} @ monthly rate`,
      units: monthlyUnits,
      unitPricePaise: monthlyRate,
      amountPaise: monthlyUnits * monthlyRate,
    });
  }
  if (weeklyUnits > 0) {
    items.push({
      kind: 'weekly_cycle',
      description: `${weeklyUnits} week${weeklyUnits === 1 ? '' : 's'} @ weekly rate`,
      units: weeklyUnits,
      unitPricePaise: weeklyRate,
      amountPaise: weeklyUnits * weeklyRate,
    });
  }
  if (dailyUnits > 0) {
    items.push({
      kind: 'daily_nights',
      description: `${dailyUnits} day${dailyUnits === 1 ? '' : 's'} @ daily rate`,
      units: dailyUnits,
      unitPricePaise: dailyRate,
      amountPaise: dailyUnits * dailyRate,
    });
  }
  if (proRataUnits > 0 && proRataRate > 0) {
    items.push({
      kind: 'pro_rata_days',
      description: `${proRataUnits} pro-rata day${proRataUnits === 1 ? '' : 's'}`,
      units: proRataUnits,
      unitPricePaise: proRataRate,
      amountPaise: proRataUnits * proRataRate,
    });
  }
  return items;
}

/**
 * Evaluate weeks+days combos, pure daily, weekly-ceil, and monthly pro-rata;
 * pick the cheapest valid total.
 */
export function computeLowestFixedStayRent(input: {
  nights: number;
  dailyRatePaise: number;
  weeklyRatePaise: number;
  monthlyRatePaise?: number;
}): LowestFixedStayQuote {
  const { nights, dailyRatePaise, weeklyRatePaise } = input;
  const monthlyRatePaise = input.monthlyRatePaise ?? 0;
  const candidates: Candidate[] = [];

  if (dailyRatePaise > 0) {
    candidates.push({
      label: 'pure_daily',
      strategy: 'pure_daily',
      subtotalPaise: nights * dailyRatePaise,
      lineItems: rentLineItems(0, 0, nights, dailyRatePaise),
      lowestPriceApplied: false,
      units: nights,
    });
  }

  if (weeklyRatePaise > 0) {
    const weeks = Math.ceil(nights / 7);
    candidates.push({
      label: 'weekly_ceil',
      strategy: 'weekly_ceil',
      subtotalPaise: weeks * weeklyRatePaise,
      lineItems: rentLineItems(weeks, weeklyRatePaise, 0, 0),
      lowestPriceApplied: false,
      units: weeks,
    });

    for (let w = 0; w <= Math.floor(nights / 7); w += 1) {
      const rem = nights - w * 7;
      const subtotal = w * weeklyRatePaise + rem * dailyRatePaise;
      candidates.push({
        label: `weeks_plus_days_${w}_${rem}`,
        strategy: 'weeks_plus_days',
        subtotalPaise: subtotal,
        lineItems: rentLineItems(w, weeklyRatePaise, rem, dailyRatePaise),
        lowestPriceApplied: false,
        units: w + (rem > 0 ? 1 : 0),
      });
    }
  }

  if (monthlyRatePaise > 0 && nights >= 28) {
    const months = Math.floor(nights / 30);
    const remainingDays = nights % 30;
    const proRataUnit =
      dailyRatePaise > 0 ? dailyRatePaise : Math.ceil(monthlyRatePaise / 30);
    const subtotal = months * monthlyRatePaise + remainingDays * proRataUnit;
    if (subtotal > 0) {
      candidates.push({
        label: 'monthly_pro_rata',
        strategy: 'monthly_pro_rata',
        subtotalPaise: subtotal,
        lineItems: rentLineItems(
          0,
          0,
          0,
          0,
          months,
          monthlyRatePaise,
          remainingDays,
          proRataUnit,
        ),
        lowestPriceApplied: false,
        units: months + (remainingDays > 0 ? 1 : 0),
      });
    }
  }

  const valid = candidates.filter((c) => c.subtotalPaise > 0);
  if (valid.length === 0) {
    return {
      subtotalPaise: 0,
      lineItems: [],
      strategy: 'weeks_plus_days',
      lowestPriceApplied: false,
      units: 0,
    };
  }

  valid.sort((a, b) => a.subtotalPaise - b.subtotalPaise);
  const best = valid[0]!;
  const naiveWeekDay = valid.find((c) => c.label.startsWith('weeks_plus_days_'));
  const lowestPriceApplied = naiveWeekDay
    ? best.subtotalPaise < naiveWeekDay.subtotalPaise
    : valid.length > 1;

  return { ...best, lowestPriceApplied };
}

/** Client-side preview helper (no monthly pro-rata without dates). */
export function previewLowestFixedStayRent(
  nights: number,
  dailyRatePaise: number,
  weeklyRatePaise: number,
): number {
  if (nights <= 0) return 0;
  return computeLowestFixedStayRent({ nights, dailyRatePaise, weeklyRatePaise }).subtotalPaise;
}
