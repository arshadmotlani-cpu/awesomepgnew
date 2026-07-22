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
    };
  }

  return {
    verifiedAmountPaise: input.storedAmountPaise,
    shouldRepairStoredAmount: false,
    repairReason: null,
  };
}

/** @deprecated Internal diagnostics only — never surface to admin UI. */
export function detectProofAmountCorruption(input: {
  proofAmountPaise: number;
  rentDuePaise: number;
  depositDuePaise: number;
  expectedCheckoutPaise: number;
}): string | null {
  if (
    isRentDoubleCountCorruption({
      storedAmountPaise: input.proofAmountPaise,
      rentDuePaise: input.rentDuePaise,
      expectedCheckoutPaise: input.expectedCheckoutPaise,
    })
  ) {
    return 'rent_double_count';
  }
  return null;
}
