import type { CheckoutSettlementWaterfall } from '@/src/lib/checkout/checkoutSettlementEngineV2';

export type ResidentMoveOutRefundSummary = {
  securityDepositPaise: number;
  unusedPrepaidRentPaise: number;
  electricityDeductionPaise: number;
  otherDeductionsPaise: number;
  estimatedRefundPaise: number;
};

/** Resident refund card — derived from checkout settlement waterfall SSOT. */
export function buildResidentMoveOutRefundSummary(
  waterfall: CheckoutSettlementWaterfall,
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
  };
}
