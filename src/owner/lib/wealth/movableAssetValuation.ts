import { coerceWealthPaise } from '@/src/owner/lib/wealth/paiseCoercion';
import {
  completedAppreciationYears,
  isUserRecordedValuation,
  projectPropertyValue,
} from '@/src/owner/lib/wealth/propertyValuation';
import { ownershipSharePaise } from '@/src/owner/lib/wealth/types';

export function estimatedMovableValueFromRate(input: {
  purchasePricePaise: number;
  purchaseDate: string;
  annualRateBps: number;
  isDepreciation: boolean;
  asOfDate?: string;
}): number {
  const purchase = coerceWealthPaise(input.purchasePricePaise);
  const asOf = input.asOfDate ?? new Date().toISOString().slice(0, 10);
  const years = completedAppreciationYears(input.purchaseDate, asOf);
  if (years <= 0) return purchase;

  if (input.isDepreciation) {
    const rate = Math.abs(input.annualRateBps) / 10000;
    return Math.max(0, Math.round(purchase * Math.pow(1 - rate, years)));
  }

  if (input.annualRateBps <= 0) return purchase;
  return projectPropertyValue({
    basisPaise: purchase,
    annualRateBps: input.annualRateBps,
    years,
  });
}

export type MovableValueState = {
  actualCurrentValuePaise: number | null;
  estimatedCurrentValuePaise: number;
  currentValueForNetWorthPaise: number;
  valueSource: 'actual' | 'estimated';
  yearsHeld: number;
};

export function resolveMovableValueState(input: {
  latestValuationPaise?: number | null;
  latestValuationKind?: string | null;
  latestValuationNotes?: string | null;
  purchasePricePaise: number;
  purchaseDate?: string | null;
  annualRateBps?: number | null;
  isDepreciation?: boolean;
  asOfDate?: string;
}): MovableValueState {
  const purchase = coerceWealthPaise(input.purchasePricePaise);
  const asOf = input.asOfDate ?? new Date().toISOString().slice(0, 10);
  const isDepreciation = input.isDepreciation ?? true;

  const estimatedCurrentValuePaise =
    input.purchaseDate && input.annualRateBps != null
      ? estimatedMovableValueFromRate({
          purchasePricePaise: purchase,
          purchaseDate: input.purchaseDate,
          annualRateBps: input.annualRateBps,
          isDepreciation,
          asOfDate: asOf,
        })
      : purchase;

  const hasActual =
    input.latestValuationPaise != null &&
    isUserRecordedValuation(
      input.latestValuationKind ?? 'MARKET_ESTIMATE',
      input.latestValuationNotes,
    );

  const actualCurrentValuePaise = hasActual
    ? coerceWealthPaise(input.latestValuationPaise)
    : null;

  const yearsHeld = input.purchaseDate ? completedAppreciationYears(input.purchaseDate, asOf) : 0;

  return {
    actualCurrentValuePaise,
    estimatedCurrentValuePaise,
    currentValueForNetWorthPaise: actualCurrentValuePaise ?? estimatedCurrentValuePaise,
    valueSource: hasActual ? 'actual' : 'estimated',
    yearsHeld,
  };
}

export function ownerShareMovableValuePaise(valuePaise: number, ownershipPctBps: number): number {
  return ownershipSharePaise(coerceWealthPaise(valuePaise), ownershipPctBps);
}
