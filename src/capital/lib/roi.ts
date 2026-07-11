import { calcRoiBps } from '@/src/capital/lib/money';

/**
 * Portfolio / period ROI — canonical formulas:
 *
 * Business ROI = Gross Business Profit ÷ Lifetime Purchase Volume
 * Personal ROI = My Profit ÷ My Capital Invested
 *
 * When partner share > 0, Personal ROI is clamped so it never exceeds Business ROI
 * (50:50 on equal capital → Personal ≈ half of Business).
 */

export function computeBusinessRoiBps(
  grossBusinessProfitPaise: number,
  lifetimePurchaseVolumePaise: number,
): number {
  return calcRoiBps(grossBusinessProfitPaise, lifetimePurchaseVolumePaise) ?? 0;
}

export function computePersonalRoiBps(
  myProfitPaise: number,
  myCapitalInvestedPaise: number,
): number {
  return calcRoiBps(myProfitPaise, myCapitalInvestedPaise) ?? 0;
}

/**
 * Resolve personal capital base. Prefer capital investments; if none recorded,
 * fall back to purchase volume so ROI is defined.
 */
export function resolvePersonalCapitalBase(
  capitalInvestedPaise: number,
  lifetimePurchaseVolumePaise: number,
): number {
  if (capitalInvestedPaise > 0) return capitalInvestedPaise;
  return lifetimePurchaseVolumePaise;
}

/**
 * When profits are shared with a partner, Personal ROI must not exceed Business ROI.
 * (Equal capital + 50% share ⇒ Personal ≈ Business / 2.)
 */
export function clampPersonalRoiBps(
  personalRoiBps: number,
  businessRoiBps: number,
  partnerSharePaise: number,
): number {
  if (partnerSharePaise > 0 && personalRoiBps > businessRoiBps) {
    return businessRoiBps;
  }
  return personalRoiBps;
}

export function computePortfolioRois(input: {
  grossBusinessProfitPaise: number;
  myProfitPaise: number;
  partnerSharePaise: number;
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
  const rawPersonal = computePersonalRoiBps(input.myProfitPaise, capitalBasePaise);
  const myRoiBps = clampPersonalRoiBps(
    rawPersonal,
    businessRoiBps,
    input.partnerSharePaise,
  );
  return { businessRoiBps, myRoiBps, capitalBasePaise };
}

/** Per-vehicle ROIs share the same investment base (purchase + expenses). */
export function computeVehicleRois(
  grossProfitPaise: number,
  mySharePaise: number,
  partnerSharePaise: number,
  totalInvestmentPaise: number,
): { businessRoiBps: number | null; myRoiBps: number | null; roiBps: number | null } {
  const businessRoiBps = calcRoiBps(grossProfitPaise, totalInvestmentPaise);
  const rawMy = calcRoiBps(mySharePaise, totalInvestmentPaise);
  const myRoiBps =
    rawMy == null
      ? null
      : clampPersonalRoiBps(rawMy, businessRoiBps ?? 0, partnerSharePaise);
  return {
    businessRoiBps,
    myRoiBps,
    /** Legacy field = business (gross) ROI */
    roiBps: businessRoiBps,
  };
}
