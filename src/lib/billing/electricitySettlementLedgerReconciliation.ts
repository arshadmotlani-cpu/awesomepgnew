/**
 * Pure electricity settlement ledger reconciliation — room bill must fully account
 * for credits + resident allocations + operator rounding remainder.
 */

export type ElectricitySettlementLedgerReconciliationInput = {
  totalRoomBillPaise: number;
  prepaidCreditAppliedPaise: number;
  checkoutSettlementCreditsPaise: number;
  manualCreditsPaise: number;
  residentAllocationsPaise: number;
  roundingRemainderPaise: number;
};

export type ElectricitySettlementLedgerReconciliationResult = {
  remainingRoomBalancePaise: number;
  /** Credits applied before resident split. */
  totalCreditsPaise: number;
  /** Should be 0 when bill generation math is correct. */
  reconciliationGapPaise: number;
  isBalanced: boolean;
};

export function computeElectricitySettlementLedgerReconciliation(
  input: ElectricitySettlementLedgerReconciliationInput,
): ElectricitySettlementLedgerReconciliationResult {
  const totalCreditsPaise =
    input.prepaidCreditAppliedPaise +
    input.checkoutSettlementCreditsPaise +
    input.manualCreditsPaise;

  const remainingRoomBalancePaise = Math.max(
    0,
    input.totalRoomBillPaise - totalCreditsPaise,
  );

  const accountedPaise =
    totalCreditsPaise + input.residentAllocationsPaise + input.roundingRemainderPaise;

  const reconciliationGapPaise = input.totalRoomBillPaise - accountedPaise;
  const isBalanced = reconciliationGapPaise === 0;

  return {
    remainingRoomBalancePaise,
    totalCreditsPaise,
    reconciliationGapPaise,
    isBalanced,
  };
}

/** Collection-side reconciliation: all money in must equal room bill when fully settled. */
export function computeElectricityCollectionReconciliation(input: {
  totalRoomBillPaise: number;
  collectedPaise: number;
}): {
  outstandingPaise: number;
  isFullyCollected: boolean;
  overCollectionPaise: number;
  rawCollectedPaise: number;
} {
  const rawCollectedPaise = Math.max(0, input.collectedPaise);
  const cappedCollected = Math.min(rawCollectedPaise, input.totalRoomBillPaise);
  const overCollectionPaise = Math.max(0, rawCollectedPaise - input.totalRoomBillPaise);
  const outstandingPaise = Math.max(0, input.totalRoomBillPaise - cappedCollected);
  return {
    outstandingPaise,
    isFullyCollected: outstandingPaise === 0 && overCollectionPaise === 0,
    overCollectionPaise,
    rawCollectedPaise,
  };
}
