/** Feature flag — new checkout settlements use Engine V2 when enabled. */
export function isCheckoutSettlementV2Enabled(): boolean {
  const raw = process.env.CHECKOUT_SETTLEMENT_V2?.trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
}

export function settlementUsesEngineV2(row: {
  settlementEngineVersion?: number | null;
  amountsLocked?: boolean | null;
}): boolean {
  if (row.amountsLocked) {
    return (row.settlementEngineVersion ?? 1) >= 2;
  }
  if ((row.settlementEngineVersion ?? 1) >= 2) return true;
  return isCheckoutSettlementV2Enabled();
}
