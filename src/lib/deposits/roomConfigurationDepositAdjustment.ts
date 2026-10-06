/**
 * Deposit requirement after a room configuration (sharing/rent) change applies.
 * deposit_ledger collected amount is SSOT; booking.deposit_paise is the current required deposit.
 */

export type RoomConfigurationDepositAdjustment = {
  /** Canonical required deposit after configuration applies. */
  depositPaise: number;
  /** Outstanding deposit still to collect (never negative). */
  depositDuePaise: number;
  /** Collected deposit above current requirement (refundable escrow, not rent credit). */
  excessRefundableDepositPaise: number;
};

export function computeRoomConfigurationDepositAdjustment(input: {
  newRequiredDepositPaise: number;
  collectedDepositPaise: number;
}): RoomConfigurationDepositAdjustment {
  const depositPaise = Math.max(0, input.newRequiredDepositPaise);
  const collected = Math.max(0, input.collectedDepositPaise);
  const depositDuePaise = Math.max(0, depositPaise - collected);
  const excessRefundableDepositPaise = Math.max(0, collected - depositPaise);
  return { depositPaise, depositDuePaise, excessRefundableDepositPaise };
}

/**
 * Legacy applyDepositAdjustmentsForRoom skipped when newRequired <= booking.depositPaise,
 * leaving stale high deposit_paise / deposit_due after a cheaper configuration applied.
 */
export function shouldApplyRoomConfigurationDepositAdjustment(input: {
  newRequiredDepositPaise: number;
  previousRequiredDepositPaise: number;
  collectedDepositPaise: number;
}): boolean {
  const next = computeRoomConfigurationDepositAdjustment({
    newRequiredDepositPaise: input.newRequiredDepositPaise,
    collectedDepositPaise: input.collectedDepositPaise,
  });
  return (
    next.depositPaise !== input.previousRequiredDepositPaise ||
    next.depositDuePaise !==
      Math.max(0, input.previousRequiredDepositPaise - input.collectedDepositPaise)
  );
}
