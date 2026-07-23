/**
 * Checkout Settlement Engine V2 is the single source of truth for all new settlements.
 * Legacy V1 preview applies only to amounts-locked rows with settlement_engine_version < 2.
 */
export function isCheckoutSettlementV2Enabled(): boolean {
  return true;
}

export function settlementUsesEngineV2(row: {
  settlementEngineVersion?: number | null;
  amountsLocked?: boolean | null;
}): boolean {
  if (row.amountsLocked) {
    return (row.settlementEngineVersion ?? 1) >= 2;
  }
  return true;
}
