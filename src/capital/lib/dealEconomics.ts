/**
 * Deal economics SSOT — Net Vehicle Cost + Profit Distribution Mode.
 *
 * Gross Deal Profit = Sale − Total Vehicle Investment (TVI)
 * SELF               → My Profit = Gross, Sufii = 0
 * PARTNERSHIP_50_50  → My Profit = round(Gross/2), Sufii = Gross − My
 *
 * Capital investors remain for funding / My ROI base only.
 * Deal profit is only My vs Sufii — investor_2 gets 0 deal profit.
 */

import { calcRoiBps } from '@/src/capital/lib/money';
import type { ResolvedInvestor } from '@/src/capital/lib/investors';
import type { InvestorSlot } from '@/src/capital/db/schema/investors';
import type { ProfitDistributionMode } from '@/src/capital/db/schema/enums';
import { computeVehicleRois } from '@/src/capital/lib/roi';
import { DEFAULT_INVESTOR_LABELS } from '@/src/capital/db/schema/investors';

export type { ProfitDistributionMode };

export type ExpenseAmountRow = { amountPaise: number };

export type NetVehicleCostBreakdown = {
  purchasePricePaise: number;
  repairTotalPaise: number;
  dealerRefundTotalPaise: number;
  /** Signed expense sum (repairs − refunds) */
  totalExpensePaise: number;
  netVehicleCostPaise: number;
};

/** @deprecated Vehicle deals no longer use Settings cut — kept for manual profits callers. */
export type OperatingPartnerSettings = {
  numerator: number;
  denominator: number;
};

export type DealProfitDistribution = {
  /** Gross Deal Profit */
  businessProfitPaise: number;
  operatingPartnerSharePaise: number;
  /** Pool after Sufii = My Profit (capital Me receives) */
  investorPoolPaise: number;
  operatingPartnerPctBps: number;
  profitDistributionMode: ProfitDistributionMode;
  investors: ResolvedInvestor[];
  myProfitPaise: number;
  myInvestedPaise: number;
  myInvestmentPctBps: number;
  businessRoiBps: number | null;
  myRoiBps: number | null;
};

/** Split signed expenses into repairs (positive) and dealer refunds/credits (abs of negative). */
export function summarizeExpenseTotals(expenses: ExpenseAmountRow[]): {
  repairTotalPaise: number;
  dealerRefundTotalPaise: number;
  totalExpensePaise: number;
} {
  let repairTotalPaise = 0;
  let dealerRefundTotalPaise = 0;
  for (const e of expenses) {
    const amt = Math.round(e.amountPaise);
    if (amt > 0) repairTotalPaise += amt;
    else if (amt < 0) dealerRefundTotalPaise += -amt;
  }
  return {
    repairTotalPaise,
    dealerRefundTotalPaise,
    totalExpensePaise: repairTotalPaise - dealerRefundTotalPaise,
  };
}

export function computeNetVehicleCost(
  purchasePricePaise: number,
  expenses: ExpenseAmountRow[],
): NetVehicleCostBreakdown {
  const purchase = Math.round(purchasePricePaise);
  const { repairTotalPaise, dealerRefundTotalPaise, totalExpensePaise } =
    summarizeExpenseTotals(expenses);
  return {
    purchasePricePaise: purchase,
    repairTotalPaise,
    dealerRefundTotalPaise,
    totalExpensePaise,
    netVehicleCostPaise: purchase + totalExpensePaise,
  };
}

/** funding_gap = netVehicleCost − Σ invested (0 = fully funded; >0 underfunded; <0 overfunded). */
export function computeFundingGap(
  netVehicleCostPaise: number,
  totalInvestedPaise: number,
): number {
  return Math.round(netVehicleCostPaise) - Math.round(totalInvestedPaise);
}

export function isFullyFunded(fundingGapPaise: number): boolean {
  return fundingGapPaise === 0;
}

export function profitDistributionLabel(mode: ProfitDistributionMode): string {
  return mode === 'SELF' ? 'Self' : 'Partnership 50–50';
}

/**
 * Gross Deal Profit = Sale Price − Total Vehicle Investment (TVI).
 * Only place that may compute this for vehicle deals — callers must not inline sale − TVI.
 */
export function computeGrossDealProfit(
  salePricePaise: number,
  totalVehicleInvestmentPaise: number,
): number {
  return Math.round(salePricePaise) - Math.round(totalVehicleInvestmentPaise);
}

/**
 * Split Gross Deal Profit by Profit Distribution Mode.
 * Partnership uses Math.round(gross/2) for My; Sufii gets the remainder.
 */
export function splitGrossDealProfit(
  businessProfitPaise: number,
  mode: ProfitDistributionMode,
): { myProfitPaise: number; sufiiProfitPaise: number; operatingPartnerPctBps: number } {
  const gross = Math.round(businessProfitPaise);
  if (mode === 'SELF') {
    return { myProfitPaise: gross, sufiiProfitPaise: 0, operatingPartnerPctBps: 0 };
  }
  const myProfitPaise = Math.round(gross / 2);
  return {
    myProfitPaise,
    sufiiProfitPaise: gross - myProfitPaise,
    operatingPartnerPctBps: 5000,
  };
}

/**
 * @deprecated Vehicle deals MUST NOT use this.
 * Settings Sufii cut is for **manual profits only** (`profitShare.ts` / ManualProfitForm).
 * Vehicle deals use `splitGrossDealProfit` + `profitDistributionMode`.
 */
export function operatingPartnerShareFromSettings(
  businessProfitPaise: number,
  settings: OperatingPartnerSettings,
): number {
  const num = settings.numerator;
  const den = settings.denominator;
  if (!Number.isFinite(num) || !Number.isFinite(den) || den <= 0) {
    throw new Error('Invalid operating partner share settings');
  }
  return Math.round((Math.round(businessProfitPaise) * num) / den);
}

/**
 * Full post-sale distribution from Profit Distribution Mode.
 * Capital funding slots are used for My invested / ROI only — not for splitting deal profit.
 */
export function distributeDealProfits(input: {
  businessProfitPaise: number;
  netVehicleCostPaise: number;
  profitDistributionMode: ProfitDistributionMode;
  funding: { slot: InvestorSlot; investedPaise: number; label: string }[];
}): DealProfitDistribution {
  const businessProfitPaise = Math.round(input.businessProfitPaise);
  const mode = input.profitDistributionMode;
  const { myProfitPaise, sufiiProfitPaise, operatingPartnerPctBps } = splitGrossDealProfit(
    businessProfitPaise,
    mode,
  );
  const investorPoolPaise = myProfitPaise;

  const totalInvested = input.funding.reduce((s, f) => s + f.investedPaise, 0);
  const meRow = input.funding.find((f) => f.slot === 'me');
  const myInvestedPaise = meRow?.investedPaise ?? 0;
  const myInvestmentPctBps =
    totalInvested > 0 ? Math.round((myInvestedPaise * 10000) / totalInvested) : 10000;

  const investors: ResolvedInvestor[] = input.funding.map((f) => {
    const profitPaise = f.slot === 'me' ? myProfitPaise : 0;
    return {
      slot: f.slot,
      label: f.label || DEFAULT_INVESTOR_LABELS[f.slot] || f.slot,
      investedPaise: f.investedPaise,
      profitPaise,
      roiBps:
        f.investedPaise > 0 && profitPaise != null
          ? Math.round((profitPaise * 10000) / f.investedPaise)
          : profitPaise === 0
            ? 0
            : null,
    };
  });

  if (!investors.some((i) => i.slot === 'me')) {
    investors.unshift({
      slot: 'me',
      label: DEFAULT_INVESTOR_LABELS.me,
      investedPaise: myInvestedPaise,
      profitPaise: myProfitPaise,
      roiBps:
        myInvestedPaise > 0 ? Math.round((myProfitPaise * 10000) / myInvestedPaise) : null,
    });
  }

  const rois = computeVehicleRois({
    grossProfitPaise: businessProfitPaise,
    totalVehicleCostPaise: input.netVehicleCostPaise,
    myProfitPaise,
    myInvestedPaise,
  });

  return {
    businessProfitPaise,
    operatingPartnerSharePaise: sufiiProfitPaise,
    investorPoolPaise,
    operatingPartnerPctBps,
    profitDistributionMode: mode,
    investors,
    myProfitPaise,
    myInvestedPaise,
    myInvestmentPctBps,
    businessRoiBps: rois.businessRoiBps,
    myRoiBps: rois.myRoiBps,
  };
}

export function calcInvestorRoiBps(
  profitPaise: number | null,
  investedPaise: number,
): number | null {
  if (profitPaise == null) return null;
  return calcRoiBps(profitPaise, investedPaise);
}
