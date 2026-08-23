import { getTotalBankBalancePaise } from '@/src/owner/services/journal';
import { getTotalLiabilityPaise } from '@/src/owner/services/liabilities';
import { getTotalMovableAssetValuePaise } from '@/src/owner/services/movableAssets';
import { getTotalPropertyValuePaise } from '@/src/owner/services/properties';

export type AssetBreakdown = {
  asOf: string;
  fixedAssetsPaise: number;
  movableAssetsPaise: number;
  financialAssetsPaise: number;
  totalAssetsPaise: number;
  totalLiabilitiesPaise: number;
  /**
   * Gross net worth = total assets (before liabilities).
   * Same number as `totalAssetsPaise` — named for dashboard UX clarity.
   */
  grossNetWorthPaise: number;
  /** Actual net worth = total assets − total liabilities. */
  netWorthPaise: number;
  /** Capital vehicle portfolio used only when Owner DB has no movable assets */
  capitalVehicleFallbackPaise: number;
};

/**
 * Pure position math — single source for Gross NW vs NW.
 * Gross Net Worth = Total Assets.
 * Net Worth = Total Assets − Total Liabilities.
 */
export function computeWealthPosition(
  totalAssetsPaise: number,
  totalLiabilitiesPaise: number,
): {
  totalAssetsPaise: number;
  totalLiabilitiesPaise: number;
  grossNetWorthPaise: number;
  netWorthPaise: number;
} {
  const assets = Number(totalAssetsPaise) || 0;
  const liabilities = Number(totalLiabilitiesPaise) || 0;
  return {
    totalAssetsPaise: assets,
    totalLiabilitiesPaise: liabilities,
    grossNetWorthPaise: assets,
    netWorthPaise: assets - liabilities,
  };
}

/**
 * Wealth aggregation with fixed / movable / financial asset classes.
 * Movable: Owner DB movable assets; falls back to Capital vehicle portfolio when empty.
 * Financial: bank/cash balances (journal-derived).
 */
export async function getAssetBreakdown(opts?: {
  asOfDate?: string;
  capitalVehiclePaise?: number;
}): Promise<AssetBreakdown> {
  const asOf = opts?.asOfDate ?? new Date().toISOString().slice(0, 10);
  const capitalVehiclePaise = opts?.capitalVehiclePaise ?? 0;

  const [fixedAssetsPaise, movableDbPaise, financialAssetsPaise, totalLiabilitiesPaise] =
    await Promise.all([
      getTotalPropertyValuePaise(asOf),
      getTotalMovableAssetValuePaise(asOf),
      getTotalBankBalancePaise(),
      getTotalLiabilityPaise(),
    ]);

  const capitalVehicleFallbackPaise =
    movableDbPaise > 0 ? 0 : capitalVehiclePaise;
  const movableAssetsPaise = movableDbPaise + capitalVehicleFallbackPaise;

  const totalAssetsPaise = fixedAssetsPaise + movableAssetsPaise + financialAssetsPaise;
  const position = computeWealthPosition(totalAssetsPaise, totalLiabilitiesPaise);

  return {
    asOf,
    fixedAssetsPaise,
    movableAssetsPaise,
    financialAssetsPaise,
    totalAssetsPaise: position.totalAssetsPaise,
    totalLiabilitiesPaise: position.totalLiabilitiesPaise,
    grossNetWorthPaise: position.grossNetWorthPaise,
    netWorthPaise: position.netWorthPaise,
    capitalVehicleFallbackPaise,
  };
}
