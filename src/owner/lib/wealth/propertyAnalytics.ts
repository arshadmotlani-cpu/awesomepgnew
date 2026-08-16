/**
 * Property ROI, rental yield, and performance analytics — pure calculations.
 */
import { coerceWealthPaise } from '@/src/owner/lib/wealth/paiseCoercion';

export type PropertyAnalyticsInput = {
  ownerBasisPaise: number;
  ownerCurrentValuePaise: number;
  yearlyIncomePaise: number;
  yearlyExpensePaise: number;
  purchaseDate?: string | null;
  asOfDate?: string;
};

export type PropertyAnalytics = {
  capitalAppreciationPaise: number;
  capitalAppreciationPct: number;
  annualizedRoiPct: number | null;
  rentalYieldPct: number | null;
  netRentalYieldPct: number | null;
  incomeToValueRatioPct: number | null;
  netYearlyIncomePaise: number;
  equityGrowthPaise: number;
};

export function computePropertyAnalytics(input: PropertyAnalyticsInput): PropertyAnalytics {
  const basis = coerceWealthPaise(input.ownerBasisPaise);
  const current = coerceWealthPaise(input.ownerCurrentValuePaise);
  const yearlyIncome = coerceWealthPaise(input.yearlyIncomePaise);
  const yearlyExpense = coerceWealthPaise(input.yearlyExpensePaise);
  const netYearlyIncome = yearlyIncome - yearlyExpense;

  const capitalAppreciationPaise = current - basis;
  const capitalAppreciationPct = basis > 0 ? (capitalAppreciationPaise / basis) * 100 : 0;

  let annualizedRoiPct: number | null = null;
  if (input.purchaseDate && basis > 0) {
    const purchase = new Date(`${input.purchaseDate}T12:00:00`);
    const asOf = new Date(
      `${input.asOfDate ?? new Date().toISOString().slice(0, 10)}T12:00:00`,
    );
    const years =
      (asOf.getTime() - purchase.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    if (years > 0.08) {
      const totalReturn = capitalAppreciationPaise + netYearlyIncome;
      annualizedRoiPct = (totalReturn / basis / years) * 100;
    }
  }

  const rentalYieldPct = current > 0 ? (yearlyIncome / current) * 100 : null;
  const netRentalYieldPct = current > 0 ? (netYearlyIncome / current) * 100 : null;
  const incomeToValueRatioPct = current > 0 ? (yearlyIncome / current) * 100 : null;

  return {
    capitalAppreciationPaise,
    capitalAppreciationPct,
    annualizedRoiPct,
    rentalYieldPct,
    netRentalYieldPct,
    incomeToValueRatioPct,
    netYearlyIncomePaise: netYearlyIncome,
    equityGrowthPaise: capitalAppreciationPaise,
  };
}
