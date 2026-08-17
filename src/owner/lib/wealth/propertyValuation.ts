import {
  ownershipSharePaise,
  type ValuationKind,
} from '@/src/owner/lib/wealth/types';
import { coerceWealthPaise } from '@/src/owner/lib/wealth/paiseCoercion';

export type PropertyBasis = {
  purchasePricePaise: number;
  purchaseCostsPaise: number;
  ownershipPctBps: number;
};

export function propertyBasisPaise(basis: PropertyBasis): number {
  return coerceWealthPaise(basis.purchasePricePaise) + coerceWealthPaise(basis.purchaseCostsPaise);
}

/** Total acquisition basis (purchase + explicit costs) — NOT current market value. */
export function acquisitionBasisPaise(basis: PropertyBasis): number {
  return propertyBasisPaise(basis);
}

/**
 * User-recorded valuations (ACTUAL, APPRAISAL, MARKET_ESTIMATE) count as actual current value.
 * PROJECTED and system auto-corrections do not override the appreciation model.
 */
export function isUserRecordedValuation(kind: string, notes?: string | null): boolean {
  if (kind === 'PROJECTED') return false;
  if (notes?.toLowerCase().includes('production correction')) return false;
  return true;
}

/**
 * Completed full annual compounding periods between purchase date and as-of date.
 * Rule: calendar years elapsed minus one if the as-of date is before the purchase anniversary.
 * Example: purchase 2020-01-01, as-of 2026-08-17 → 6 completed years (2020→2026).
 */
export function completedAppreciationYears(purchaseDate: string, asOfDate: string): number {
  const [py, pm, pd] = purchaseDate.split('-').map((n) => Number(n));
  const [ay, am, ad] = asOfDate.split('-').map((n) => Number(n));
  let years = ay - py;
  if (am < pm || (am === pm && ad < pd)) {
    years -= 1;
  }
  return Math.max(0, years);
}

export function projectPropertyValue(input: {
  basisPaise: number;
  annualRateBps: number;
  years: number;
}): number {
  const rate = input.annualRateBps / 10000;
  return Math.round(input.basisPaise * Math.pow(1 + rate, input.years));
}

/**
 * Illustrative market value from flat annual appreciation on purchase price.
 * Used only when no user-recorded valuation exists.
 */
export function estimatedMarketValueFromAppreciation(input: {
  purchasePricePaise: number;
  purchaseDate: string;
  annualRateBps: number;
  asOfDate?: string;
}): number {
  const purchase = coerceWealthPaise(input.purchasePricePaise);
  const asOf = input.asOfDate ?? new Date().toISOString().slice(0, 10);
  const years = completedAppreciationYears(input.purchaseDate, asOf);
  if (years <= 0 || input.annualRateBps <= 0) return purchase;
  return projectPropertyValue({
    basisPaise: purchase,
    annualRateBps: input.annualRateBps,
    years,
  });
}

export type PropertyValueState = {
  /** User-recorded valuation (ACTUAL / APPRAISAL / MARKET_ESTIMATE), if any */
  actualMarketValuePaise: number | null;
  /** Modelled value from purchase + appreciation assumption */
  estimatedMarketValuePaise: number;
  /** Value used for net worth: actual if recorded, else estimated */
  currentValueForNetWorthPaise: number;
  valueSource: 'actual' | 'estimated';
  yearsHeld: number;
  estimatedAppreciationPaise: number;
  estimatedAppreciationPct: number;
};

export function resolvePropertyValueState(input: {
  latestValuationPaise?: number | null;
  latestValuationKind?: string | null;
  latestValuationNotes?: string | null;
  purchasePricePaise: number;
  purchaseDate?: string | null;
  annualRateBps?: number | null;
  asOfDate?: string;
}): PropertyValueState {
  const purchase = coerceWealthPaise(input.purchasePricePaise);
  const asOf = input.asOfDate ?? new Date().toISOString().slice(0, 10);

  const estimatedMarketValuePaise =
    input.purchaseDate && input.annualRateBps != null && input.annualRateBps > 0
      ? estimatedMarketValueFromAppreciation({
          purchasePricePaise: purchase,
          purchaseDate: input.purchaseDate,
          annualRateBps: input.annualRateBps,
          asOfDate: asOf,
        })
      : purchase;

  const hasActual =
    input.latestValuationPaise != null &&
    isUserRecordedValuation(
      input.latestValuationKind ?? 'MARKET_ESTIMATE',
      input.latestValuationNotes,
    );

  const actualMarketValuePaise = hasActual
    ? coerceWealthPaise(input.latestValuationPaise)
    : null;

  const currentValueForNetWorthPaise = actualMarketValuePaise ?? estimatedMarketValuePaise;
  const yearsHeld = input.purchaseDate ? completedAppreciationYears(input.purchaseDate, asOf) : 0;
  const estimatedAppreciationPaise = estimatedMarketValuePaise - purchase;
  const estimatedAppreciationPct =
    purchase > 0 ? (estimatedAppreciationPaise / purchase) * 100 : 0;

  return {
    actualMarketValuePaise,
    estimatedMarketValuePaise,
    currentValueForNetWorthPaise,
    valueSource: hasActual ? 'actual' : 'estimated',
    yearsHeld,
    estimatedAppreciationPaise,
    estimatedAppreciationPct,
  };
}

/**
 * Legacy helper — returns user valuation or purchase price only (no appreciation model).
 * Prefer resolvePropertyValueState for net worth and property detail.
 */
export function resolveCurrentMarketValuePaise(
  latestValuationPaise: number | null | undefined,
  purchasePricePaise: number,
): number {
  if (latestValuationPaise != null) {
    return coerceWealthPaise(latestValuationPaise);
  }
  return coerceWealthPaise(purchasePricePaise);
}

export function ownerShareBasisPaise(basis: PropertyBasis): number {
  return ownershipSharePaise(acquisitionBasisPaise(basis), basis.ownershipPctBps);
}

export function ownerShareMarketValuePaise(
  marketValuePaise: number,
  ownershipPctBps: number,
): number {
  return ownershipSharePaise(marketValuePaise, ownershipPctBps);
}

export function computeAppreciationMetrics(input: {
  basis: PropertyBasis;
  currentValuePaise: number;
  purchaseDate?: string | null;
  asOfDate?: string;
}) {
  const ownerBasis = ownerShareBasisPaise(input.basis);
  const ownerCurrent = ownershipSharePaise(
    coerceWealthPaise(input.currentValuePaise),
    input.basis.ownershipPctBps,
  );
  const appreciationPaise = ownerCurrent - ownerBasis;
  const appreciationPct =
    ownerBasis > 0 ? (appreciationPaise / ownerBasis) * 100 : 0;

  let annualizedPct: number | null = null;
  if (input.purchaseDate && ownerBasis > 0) {
    const purchase = new Date(`${input.purchaseDate}T12:00:00`);
    const asOf = new Date(`${input.asOfDate ?? new Date().toISOString().slice(0, 10)}T12:00:00`);
    const years =
      (asOf.getTime() - purchase.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    if (years > 0.08) {
      annualizedPct =
        (Math.pow(ownerCurrent / ownerBasis, 1 / years) - 1) * 100;
    }
  }

  return {
    ownerBasisPaise: ownerBasis,
    ownerCurrentValuePaise: ownerCurrent,
    appreciationPaise,
    appreciationPct,
    annualizedPct,
  };
}

export function projectionHorizons(basisPaise: number, annualRateBps: number) {
  const basis = coerceWealthPaise(basisPaise);
  return {
    oneYear: projectPropertyValue({ basisPaise: basis, annualRateBps, years: 1 }),
    threeYears: projectPropertyValue({ basisPaise: basis, annualRateBps, years: 3 }),
    fiveYears: projectPropertyValue({ basisPaise: basis, annualRateBps, years: 5 }),
    tenYears: projectPropertyValue({ basisPaise: basis, annualRateBps, years: 10 }),
  };
}

/** Year-by-year projected values from a starting value (year 0 = actual/current). */
export function yearlyProjectionsFromValue(
  startingValuePaise: number,
  annualRateBps: number,
  startYear: number,
  count = 5,
): Array<{ year: number; yearsAhead: number; valuePaise: number; isProjected: boolean }> {
  const start = coerceWealthPaise(startingValuePaise);
  return Array.from({ length: count }, (_, i) => ({
    year: startYear + i,
    yearsAhead: i,
    valuePaise:
      i === 0
        ? start
        : projectPropertyValue({ basisPaise: start, annualRateBps, years: i }),
    isProjected: i > 0,
  }));
}

export const NON_PROJECTED_KINDS: ValuationKind[] = [
  'ACTUAL',
  'APPRAISAL',
  'MARKET_ESTIMATE',
];
