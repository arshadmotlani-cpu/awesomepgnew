/**
 * Business ROI = Business Profit ÷ Total Vehicle Cost (purchase + signed expenses)
 * My ROI       = My Profit ÷ My Invested stake
 *
 * Never compute My ROI against full vehicle cost unless I funded 100%.
 */

import { calcRoiBps } from '@/src/capital/lib/money';

export function computeBusinessRoiBps(
  grossBusinessProfitPaise: number,
  totalVehicleCostPaise: number,
): number {
  return calcRoiBps(grossBusinessProfitPaise, totalVehicleCostPaise) ?? 0;
}

export function computePersonalRoiBps(
  myProfitPaise: number,
  myCapitalInvestedPaise: number,
): number {
  return calcRoiBps(myProfitPaise, myCapitalInvestedPaise) ?? 0;
}

export function resolvePersonalCapitalBase(
  myVehicleCapitalPaise: number,
  fallbackVehicleCostPaise: number,
): number {
  if (myVehicleCapitalPaise > 0) return myVehicleCapitalPaise;
  return fallbackVehicleCostPaise;
}

export function computePortfolioRois(input: {
  grossBusinessProfitPaise: number;
  myProfitPaise: number;
  /** Σ net vehicle cost on sold/settled deals (purchase + signed expenses) */
  totalVehicleCostPaise: number;
  myCapitalInvestedPaise: number;
  /** @deprecated use totalVehicleCostPaise */
  lifetimePurchaseVolumePaise?: number;
}): { businessRoiBps: number; myRoiBps: number; capitalBasePaise: number } {
  const costBase =
    input.totalVehicleCostPaise > 0
      ? input.totalVehicleCostPaise
      : (input.lifetimePurchaseVolumePaise ?? 0);
  const capitalBasePaise = resolvePersonalCapitalBase(input.myCapitalInvestedPaise, costBase);
  const businessRoiBps = computeBusinessRoiBps(input.grossBusinessProfitPaise, costBase);
  const myRoiBps = computePersonalRoiBps(input.myProfitPaise, capitalBasePaise);
  return { businessRoiBps, myRoiBps, capitalBasePaise };
}

/**
 * Per-vehicle ROIs:
 * Business → total vehicle cost; Personal → my invested stake.
 */
export function computeVehicleRois(input: {
  grossProfitPaise: number;
  totalVehicleCostPaise: number;
  myProfitPaise: number;
  myInvestedPaise: number;
  /** @deprecated use totalVehicleCostPaise */
  purchasePricePaise?: number;
}): { businessRoiBps: number | null; myRoiBps: number | null; roiBps: number | null } {
  const costBase =
    input.totalVehicleCostPaise > 0
      ? input.totalVehicleCostPaise
      : (input.purchasePricePaise ?? 0);
  const businessRoiBps = calcRoiBps(input.grossProfitPaise, costBase);
  const myRoiBps = calcRoiBps(input.myProfitPaise, input.myInvestedPaise);
  return {
    businessRoiBps,
    myRoiBps,
    roiBps: businessRoiBps,
  };
}
