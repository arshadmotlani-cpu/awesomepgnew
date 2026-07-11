import { calcRoiBps } from '@/src/capital/lib/money';

/**
 * Portfolio / vehicle ROI — two layers:
 *
 * Business ROI = Business Profit ÷ Purchase Price (full vehicle cost)
 * My ROI       = My Profit ÷ My Invested Capital in that vehicle
 *
 * Never compute My ROI against the full purchase price unless I funded 100%.
 */

export function computeBusinessRoiBps(
  grossBusinessProfitPaise: number,
  purchaseVolumePaise: number,
): number {
  return calcRoiBps(grossBusinessProfitPaise, purchaseVolumePaise) ?? 0;
}

export function computePersonalRoiBps(
  myProfitPaise: number,
  myCapitalInvestedPaise: number,
): number {
  return calcRoiBps(myProfitPaise, myCapitalInvestedPaise) ?? 0;
}

export function resolvePersonalCapitalBase(
  myVehicleCapitalPaise: number,
  fallbackPurchaseVolumePaise: number,
): number {
  if (myVehicleCapitalPaise > 0) return myVehicleCapitalPaise;
  return fallbackPurchaseVolumePaise;
}

export function computePortfolioRois(input: {
  grossBusinessProfitPaise: number;
  myProfitPaise: number;
  lifetimePurchaseVolumePaise: number;
  myCapitalInvestedPaise: number;
}): { businessRoiBps: number; myRoiBps: number; capitalBasePaise: number } {
  const capitalBasePaise = resolvePersonalCapitalBase(
    input.myCapitalInvestedPaise,
    input.lifetimePurchaseVolumePaise,
  );
  const businessRoiBps = computeBusinessRoiBps(
    input.grossBusinessProfitPaise,
    input.lifetimePurchaseVolumePaise,
  );
  const myRoiBps = computePersonalRoiBps(input.myProfitPaise, capitalBasePaise);
  return { businessRoiBps, myRoiBps, capitalBasePaise };
}

/**
 * Per-vehicle ROIs use separate capital bases:
 * Business → purchase price; Personal → my invested stake.
 */
export function computeVehicleRois(input: {
  grossProfitPaise: number;
  purchasePricePaise: number;
  myProfitPaise: number;
  myInvestedPaise: number;
}): { businessRoiBps: number | null; myRoiBps: number | null; roiBps: number | null } {
  const businessRoiBps = calcRoiBps(input.grossProfitPaise, input.purchasePricePaise);
  const myRoiBps = calcRoiBps(input.myProfitPaise, input.myInvestedPaise);
  return {
    businessRoiBps,
    myRoiBps,
    roiBps: businessRoiBps,
  };
}
