/**
 * Investment budget SSOT — Capital Reset Rebuild.
 *
 * Current Investment = Seller Price + Σ Costs − Σ Refunds
 * Budget Remaining   = Expected Total Investment − Current Investment
 * Gross Profit       = Sale Price − Current Investment
 * Self / 50-50       = My vs Partner split of Gross
 *
 * Active Capital     = Σ Current Investment on open (unsold) vehicles
 */

export type CostAmountRow = {
  amountPaise: number;
  /** When true, treat as refund (reduces investment). Otherwise amount sign decides. */
  isRefund?: boolean;
  isReversed?: boolean;
};

export function sumCostsAndRefunds(rows: CostAmountRow[]): {
  costsPaise: number;
  refundsPaise: number;
  netCostsPaise: number;
} {
  let costsPaise = 0;
  let refundsPaise = 0;
  for (const row of rows) {
    if (row.isReversed) continue;
    const amt = Math.round(row.amountPaise);
    if (row.isRefund || amt < 0) {
      refundsPaise += Math.abs(amt);
    } else {
      costsPaise += amt;
    }
  }
  return {
    costsPaise,
    refundsPaise,
    netCostsPaise: costsPaise - refundsPaise,
  };
}

/** Current Investment = Seller Price + costs − refunds. */
export function computeCurrentInvestment(input: {
  sellerPricePaise: number;
  costs: CostAmountRow[];
}): {
  sellerPricePaise: number;
  costsPaise: number;
  refundsPaise: number;
  currentInvestmentPaise: number;
} {
  const sellerPricePaise = Math.max(0, Math.round(input.sellerPricePaise));
  const { costsPaise, refundsPaise, netCostsPaise } = sumCostsAndRefunds(input.costs);
  return {
    sellerPricePaise,
    costsPaise,
    refundsPaise,
    currentInvestmentPaise: sellerPricePaise + netCostsPaise,
  };
}

/** Budget Remaining = Expected − Current. Negative means over budget (warn, never block). */
export function computeBudgetRemaining(
  expectedTotalInvestmentPaise: number,
  currentInvestmentPaise: number,
): number {
  return Math.round(expectedTotalInvestmentPaise) - Math.round(currentInvestmentPaise);
}

export function computeGrossDealProfit(
  salePricePaise: number,
  currentInvestmentPaise: number,
): number {
  return Math.round(salePricePaise) - Math.round(currentInvestmentPaise);
}

export type ProfitMode = 'SELF' | 'PARTNERSHIP_50_50';

export function splitDealProfit(
  grossProfitPaise: number,
  mode: ProfitMode,
): { myProfitPaise: number; partnerProfitPaise: number } {
  const gross = Math.round(grossProfitPaise);
  if (mode === 'SELF') {
    return { myProfitPaise: gross, partnerProfitPaise: 0 };
  }
  const myProfitPaise = Math.round(gross / 2);
  return { myProfitPaise, partnerProfitPaise: gross - myProfitPaise };
}

/** Remaining owed to seller. Null if seller price not set. */
export function remainingToSeller(
  sellerPricePaise: number,
  paidPaise: number,
): number | null {
  if (Math.round(sellerPricePaise) <= 0) return null;
  return Math.max(0, Math.round(sellerPricePaise) - Math.round(paidPaise));
}
