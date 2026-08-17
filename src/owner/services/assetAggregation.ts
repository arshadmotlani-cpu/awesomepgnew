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
  netWorthPaise: number;
  /** Capital vehicle portfolio used only when Owner DB has no movable assets */
  capitalVehicleFallbackPaise: number;
};

/**
 * Net worth aggregation with fixed / movable / financial asset classes.
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
  const netWorthPaise = totalAssetsPaise - totalLiabilitiesPaise;

  return {
    asOf,
    fixedAssetsPaise,
    movableAssetsPaise,
    financialAssetsPaise,
    totalAssetsPaise,
    totalLiabilitiesPaise,
    netWorthPaise,
    capitalVehicleFallbackPaise,
  };
}
