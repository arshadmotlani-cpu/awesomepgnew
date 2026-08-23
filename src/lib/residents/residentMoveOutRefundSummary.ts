import type { CheckoutSettlementWaterfall } from '@/src/lib/checkout/checkoutSettlementEngineV2';

export type ResidentMoveOutRefundSummary = {
  /** Full security deposit held — independent of unused rent. */
  securityDepositPaise: number;
  /** Gross unused prepaid rent (before notice). */
  unusedPrepaidRentPaise: number;
  /** Notice shortfall charged from unused rent (not deposit when unused covers it). */
  noticeDeductionPaise: number;
  /** Unused prepaid after notice — wallet "Unused Rent Credit". */
  netUnusedRentWalletCreditPaise: number;
  electricityDeductionPaise: number;
  otherDeductionsPaise: number;
  estimatedRefundPaise: number;
  /** Checkout final-meter electricity not yet calculated. */
  electricityPending?: boolean;
};

/**
 * Resident refund card — derived from checkout settlement waterfall SSOT.
 *
 * Deposit and unused prepaid rent stay separate. Notice reduces unused rent first.
 * Do not treat prepaid unused days as deposit "tail rent".
 */
export function buildResidentMoveOutRefundSummary(
  waterfall: CheckoutSettlementWaterfall,
  options?: { isEstimate?: boolean },
): ResidentMoveOutRefundSummary {
  const otherDeductionsPaise =
    waterfall.notice.fromDepositPaise + waterfall.depositBucket.otherPaise;

  return {
    securityDepositPaise: waterfall.depositBucket.collectedPaise,
    unusedPrepaidRentPaise: waterfall.rentBucket.unusedPaise,
    noticeDeductionPaise: waterfall.notice.fullPaise,
    netUnusedRentWalletCreditPaise: waterfall.refund.unusedRentPortionPaise,
    electricityDeductionPaise: waterfall.depositBucket.electricityPaise,
    otherDeductionsPaise,
    estimatedRefundPaise: waterfall.refund.totalPaise,
    electricityPending:
      options?.isEstimate === true && waterfall.depositBucket.electricityPaise === 0,
  };
}
