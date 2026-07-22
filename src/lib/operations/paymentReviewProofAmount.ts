/**
 * SSOT — amount for the ONE payment proof under review (not lifetime account totals).
 */

import type { PendingPaymentReviewItem } from '@/src/lib/operations/paymentReviewTypes';

const PROOF_AMOUNT_TOLERANCE_PAISE = 100;

/** Immutable proof row amount — verified screenshot amount, not corrupt stored values. */
export function proofAmountPaiseFromReviewItem(item: PendingPaymentReviewItem): number {
  if (item.verifiedProofAmountPaise != null && item.verifiedProofAmountPaise > 0) {
    return item.verifiedProofAmountPaise;
  }
  if (item.amountPaise > 0) return item.amountPaise;
  return item.submittedAmountPaise ?? item.receivedPaise ?? 0;
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
  repairReason: 'submitted_snapshot' | 'rent_double_count' | null;
  /**
   * Historical row where true screenshot amount cannot be proven from DB alone.
   * Repair may still apply a best-guess amount_paise — never write submitted snapshot.
   */
  isAmbiguousRepair: boolean;
};

/**
 * Resolve the verified screenshot amount for a pending proof.
 * Prefers frozen submit snapshot; auto-corrects rent double-count corruption.
 */
export function resolveVerifiedProofAmountPaise(input: {
  storedAmountPaise: number;
  proofSnapshotSubmittedPaise?: number | null;
  rentDuePaise: number;
  expectedCheckoutPaise: number;
}): VerifiedProofAmountResolution {
  const submitted = input.proofSnapshotSubmittedPaise;
  if (submitted != null && submitted > 0) {
    const shouldRepairStoredAmount =
      Math.abs(submitted - input.storedAmountPaise) > PROOF_AMOUNT_TOLERANCE_PAISE;
    return {
      verifiedAmountPaise: submitted,
      shouldRepairStoredAmount,
      repairReason: shouldRepairStoredAmount ? 'submitted_snapshot' : null,
      isAmbiguousRepair: false,
    };
  }

  if (
    isRentDoubleCountCorruption({
      storedAmountPaise: input.storedAmountPaise,
      rentDuePaise: input.rentDuePaise,
      expectedCheckoutPaise: input.expectedCheckoutPaise,
    })
  ) {
    return {
      verifiedAmountPaise: Math.max(0, input.storedAmountPaise - input.rentDuePaise),
      shouldRepairStoredAmount: true,
      repairReason: 'rent_double_count',
      isAmbiguousRepair: true,
    };
  }

  return {
    verifiedAmountPaise: input.storedAmountPaise,
    shouldRepairStoredAmount: false,
    repairReason: null,
    isAmbiguousRepair: false,
  };
}

/** Whether proof_snapshot_submitted_paise may be written for this repair. */
export function shouldFreezeSubmittedSnapshotOnRepair(
  resolution: VerifiedProofAmountResolution,
  existingSubmittedPaise?: number | null,
): boolean {
  if (existingSubmittedPaise != null && existingSubmittedPaise > 0) return false;
  if (resolution.isAmbiguousRepair) return false;
  return resolution.shouldRepairStoredAmount || resolution.verifiedAmountPaise > 0;
}
