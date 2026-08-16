import { and, desc, eq, gte, lte, ne } from 'drizzle-orm';
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

export function ownerShareBasisPaise(basis: PropertyBasis): number {
  return ownershipSharePaise(propertyBasisPaise(basis), basis.ownershipPctBps);
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

export function projectPropertyValue(input: {
  basisPaise: number;
  annualRateBps: number;
  years: number;
}): number {
  const rate = input.annualRateBps / 10000;
  return Math.round(input.basisPaise * Math.pow(1 + rate, input.years));
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
