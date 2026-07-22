/**
 * SSOT — amount for the ONE payment proof under review (not lifetime account totals).
 */

import type { PendingPaymentReviewItem } from '@/src/lib/operations/paymentReviewTypes';

const PROOF_AMOUNT_TOLERANCE_PAISE = 100;

/** Raw uploaded proof amount — never repaired or booking-derived. */
export function proofAmountPaiseFromReviewItem(item: PendingPaymentReviewItem): number {
  if (item.submittedAmountPaise != null && item.submittedAmountPaise > 0) {
    return item.submittedAmountPaise;
  }
  if (item.amountPaise > 0) return item.amountPaise;
  return item.receivedPaise ?? 0;
}

export function isRentDoubleCountCorruption(input: {
  storedAmountPaise: number;
  rentDuePaise: number;
  expectedCheckoutPaise: number;
}): boolean {
  const { storedAmountPaise, rentDuePaise, expectedCheckoutPaise } = input;
  if (storedAmountPaise <= 0 || expectedCheckoutPaise <= 0) return false;

  const rentPlusExpected = rentDuePaise + expectedCheckoutPaise;
  if (Math.abs(storedAmountPaise - rentPlusExpected) <= PROOF_AMOUNT_TOLERANCE_PAISE) {
    return true;
  }

  const excess = storedAmountPaise - expectedCheckoutPaise;
  return excess > PROOF_AMOUNT_TOLERANCE_PAISE && Math.abs(excess - rentDuePaise) <= PROOF_AMOUNT_TOLERANCE_PAISE;
}

export type VerifiedProofAmountResolution = {
  verifiedAmountPaise: number;
  /** Stored amount_paise should be updated to match verified amount. */
  shouldRepairStoredAmount: boolean;
  /** proof_snapshot_submitted_paise should be updated to match verified amount. */
  shouldRepairSubmittedSnapshot: boolean;
  repairReason: 'submitted_snapshot' | 'rent_double_count' | 'admin_correction' | null;
  /**
   * Historical row where true screenshot amount cannot be proven from DB alone.
   * Repair may still apply a best-guess amount_paise — never write submitted snapshot.
   */
  isAmbiguousRepair: boolean;
};

function amountsMatch(a: number, b: number): boolean {
  return Math.abs(a - b) <= PROOF_AMOUNT_TOLERANCE_PAISE;
}

function isPlausibleAdminCorrectedAmount(input: {
  amountPaise: number;
  corruptSubmittedPaise: number;
  expectedCheckoutPaise: number;
}): boolean {
  const { amountPaise, corruptSubmittedPaise, expectedCheckoutPaise } = input;
  if (amountPaise <= 0) return false;
  if (amountPaise >= corruptSubmittedPaise - PROOF_AMOUNT_TOLERANCE_PAISE) return false;
  return amountPaise <= expectedCheckoutPaise + PROOF_AMOUNT_TOLERANCE_PAISE;
}

/**
 * Resolve the verified screenshot amount for a pending proof.
 * Prefers frozen submit snapshot when trustworthy; auto-corrects rent double-count corruption.
 */
export function resolveVerifiedProofAmountPaise(input: {
  storedAmountPaise: number;
  proofSnapshotSubmittedPaise?: number | null;
  rentDuePaise: number;
  expectedCheckoutPaise: number;
}): VerifiedProofAmountResolution {
  const submitted = input.proofSnapshotSubmittedPaise;
  const corruptContext = {
    rentDuePaise: input.rentDuePaise,
    expectedCheckoutPaise: input.expectedCheckoutPaise,
  };

  if (submitted != null && submitted > 0) {
    const submittedIsCorrupt = isRentDoubleCountCorruption({
      storedAmountPaise: submitted,
      ...corruptContext,
    });

    if (!submittedIsCorrupt) {
      const shouldRepairStoredAmount = !amountsMatch(submitted, input.storedAmountPaise);
      return {
        verifiedAmountPaise: submitted,
        shouldRepairStoredAmount,
        shouldRepairSubmittedSnapshot: false,
        repairReason: shouldRepairStoredAmount ? 'submitted_snapshot' : null,
        isAmbiguousRepair: false,
      };
    }

    if (
      isPlausibleAdminCorrectedAmount({
        amountPaise: input.storedAmountPaise,
        corruptSubmittedPaise: submitted,
        expectedCheckoutPaise: input.expectedCheckoutPaise,
      })
    ) {
      const shouldRepairSubmittedSnapshot = !amountsMatch(input.storedAmountPaise, submitted);
      return {
        verifiedAmountPaise: input.storedAmountPaise,
        shouldRepairStoredAmount: false,
        shouldRepairSubmittedSnapshot,
        repairReason: shouldRepairSubmittedSnapshot ? 'admin_correction' : null,
        isAmbiguousRepair: false,
      };
    }
  }

  if (
    isRentDoubleCountCorruption({
      storedAmountPaise: input.storedAmountPaise,
      ...corruptContext,
    })
  ) {
    return {
      verifiedAmountPaise: Math.max(0, input.storedAmountPaise - input.rentDuePaise),
      shouldRepairStoredAmount: true,
      shouldRepairSubmittedSnapshot: false,
      repairReason: 'rent_double_count',
      isAmbiguousRepair: true,
    };
  }

  return {
    verifiedAmountPaise: input.storedAmountPaise,
    shouldRepairStoredAmount: false,
    shouldRepairSubmittedSnapshot: false,
    repairReason: null,
    isAmbiguousRepair: false,
  };
}

/** Whether page-load self-heal may write amount_paise / submitted snapshot. */
export function shouldApplyProofAmountSelfHeal(input: {
  resolution: VerifiedProofAmountResolution;
  storedAmountPaise: number;
  proofSnapshotSubmittedPaise?: number | null;
  expectedCheckoutPaise: number;
  rentDuePaise: number;
}): boolean {
  const { resolution, storedAmountPaise, proofSnapshotSubmittedPaise, expectedCheckoutPaise, rentDuePaise } =
    input;

  if (resolution.shouldRepairStoredAmount) {
    const verified = resolution.verifiedAmountPaise;
    if (
      proofSnapshotSubmittedPaise != null &&
      proofSnapshotSubmittedPaise > 0 &&
      amountsMatch(verified, proofSnapshotSubmittedPaise) &&
      isRentDoubleCountCorruption({
        storedAmountPaise: proofSnapshotSubmittedPaise,
        rentDuePaise,
        expectedCheckoutPaise,
      })
    ) {
      return false;
    }

    if (
      proofSnapshotSubmittedPaise != null &&
      proofSnapshotSubmittedPaise > 0 &&
      storedAmountPaise > 0 &&
      storedAmountPaise < proofSnapshotSubmittedPaise &&
      amountsMatch(verified, proofSnapshotSubmittedPaise)
    ) {
      return false;
    }
  }

  if (resolution.shouldRepairSubmittedSnapshot && !resolution.shouldRepairStoredAmount) {
    return true;
  }

  return resolution.shouldRepairStoredAmount;
}

/** Whether proof_snapshot_submitted_paise may be written for automatic repair. */
export function shouldFreezeSubmittedSnapshotOnRepair(
  resolution: VerifiedProofAmountResolution,
  existingSubmittedPaise?: number | null,
): boolean {
  if (resolution.repairReason === 'admin_correction') {
    return resolution.shouldRepairSubmittedSnapshot;
  }
  if (existingSubmittedPaise != null && existingSubmittedPaise > 0) return false;
  if (resolution.isAmbiguousRepair) return false;
  return resolution.shouldRepairStoredAmount || resolution.verifiedAmountPaise > 0;
}
