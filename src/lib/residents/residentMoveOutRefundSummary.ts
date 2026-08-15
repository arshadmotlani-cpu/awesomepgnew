import type { CheckoutSettlementWaterfall } from '@/src/lib/checkout/checkoutSettlementEngineV2';

export type ResidentMoveOutRefundSummary = {
  securityDepositPaise: number;
  unusedPrepaidRentPaise: number;
  electricityDeductionPaise: number;
  otherDeductionsPaise: number;
  estimatedRefundPaise: number;
  /** Checkout final-meter electricity not yet calculated. */
  electricityPending?: boolean;
};

/** Resident refund card — derived from checkout settlement waterfall SSOT. */
export function buildResidentMoveOutRefundSummary(
  waterfall: CheckoutSettlementWaterfall,
  options?: { isEstimate?: boolean },
): ResidentMoveOutRefundSummary {
  const otherDeductionsPaise =
    waterfall.notice.fromDepositPaise +
    waterfall.depositBucket.otherPaise +
    waterfall.depositBucket.tailRentPaise;

  return {
    securityDepositPaise: waterfall.depositBucket.collectedPaise,
    unusedPrepaidRentPaise: waterfall.refund.unusedRentPortionPaise,
    electricityDeductionPaise: waterfall.depositBucket.electricityPaise,
    otherDeductionsPaise,
    estimatedRefundPaise: waterfall.refund.totalPaise,
    electricityPending:
      options?.isEstimate === true && waterfall.depositBucket.electricityPaise === 0,
  };
}
