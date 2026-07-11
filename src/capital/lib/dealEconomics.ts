/**
 * Deal economics SSOT — Net Vehicle Cost, Sufii operating-partner cut, Investor Pool.
 *
 * Net Vehicle Cost = Purchase + Repairs − Refunds/Credits
 * Business Profit  = Sale − Net Vehicle Cost
 * Operating partner (Sufii) = Business Profit × Settings ratio (default 50%)
 * Investor Pool    = Business Profit − Operating partner share
 * Capital investors split Investor Pool proportional to invested stakes.
 */

import { calcRoiBps } from '@/src/capital/lib/money';
import {
  distributeInvestorProfits,
  summarizeInvestorShares,
  type ResolvedInvestor,
} from '@/src/capital/lib/investors';
import type { InvestorSlot } from '@/src/capital/db/schema/investors';
import { computeVehicleRois } from '@/src/capital/lib/roi';

export type ExpenseAmountRow = { amountPaise: number };

export type NetVehicleCostBreakdown = {
  purchasePricePaise: number;
  repairTotalPaise: number;
  dealerRefundTotalPaise: number;
  /** Signed expense sum (repairs − refunds) */
  totalExpensePaise: number;
  netVehicleCostPaise: number;
};

export type OperatingPartnerSettings = {
  numerator: number;
  denominator: number;
};

export type DealProfitDistribution = {
  businessProfitPaise: number;
  operatingPartnerSharePaise: number;
  investorPoolPaise: number;
  operatingPartnerPctBps: number;
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
 * Full post-sale distribution: Sufii cut from Settings, then Investor Pool by stake %.
 */
export function distributeDealProfits(input: {
  businessProfitPaise: number;
  netVehicleCostPaise: number;
  settings: OperatingPartnerSettings;
  funding: { slot: InvestorSlot; investedPaise: number; label: string }[];
}): DealProfitDistribution {
  const businessProfitPaise = Math.round(input.businessProfitPaise);
  const operatingPartnerSharePaise = operatingPartnerShareFromSettings(
    businessProfitPaise,
    input.settings,
  );
  const investorPoolPaise = businessProfitPaise - operatingPartnerSharePaise;
  const operatingPartnerPctBps = Math.round(
    (input.settings.numerator * 10000) / input.settings.denominator,
  );

  const investors = distributeInvestorProfits(investorPoolPaise, input.funding);
  const summary = summarizeInvestorShares(investors);
  const totalInvested = input.funding.reduce((s, f) => s + f.investedPaise, 0);
  const myInvestmentPctBps =
    totalInvested > 0
      ? Math.round((summary.myInvestedPaise * 10000) / totalInvested)
      : 10000;

  const rois = computeVehicleRois({
    grossProfitPaise: businessProfitPaise,
    totalVehicleCostPaise: input.netVehicleCostPaise,
    myProfitPaise: summary.myProfitPaise,
    myInvestedPaise: summary.myInvestedPaise,
  });

  return {
    businessProfitPaise,
    operatingPartnerSharePaise,
    investorPoolPaise,
    operatingPartnerPctBps,
    investors,
    myProfitPaise: summary.myProfitPaise,
    myInvestedPaise: summary.myInvestedPaise,
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
