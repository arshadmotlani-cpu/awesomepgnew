/**
 * Operator checkout — single authoritative final refund from waterfall + electricity SSOT.
 */
import {
  computeCheckoutSettlementV2,
  type CheckoutSettlementWaterfall,
} from '@/src/lib/checkout/checkoutSettlementEngineV2';
import { noticeDeductionAppliesToBooking } from '@/src/lib/checkout/noticeDeductionPolicy';
import {
  resolveCheckoutElectricitySharePaise,
} from '@/src/lib/checkout/electricitySettlementCalc';
import type { CheckoutSettlementDetail } from '@/src/services/checkoutSettlement';

export type OperatorFinalRefundBreakdown = {
  depositReceivedPaise: number;
  electricityDeductionPaise: number;
  otherDeductionsPaise: number;
  depositRemainingPaise: number;
  unusedPrepaidRentPaise: number;
  finalRefundPaise: number;
  waterfall: CheckoutSettlementWaterfall | null;
};

export function resolveEffectiveCheckoutElectricityDeductionPaise(
  detail: CheckoutSettlementDetail,
  overridePaise?: number | null,
): number {
  if (detail.preview.electricityDeductFromDeposit === false) return 0;
  if (overridePaise != null) return Math.max(0, overridePaise);
  if (detail.amountsLocked) {
    return resolveCheckoutElectricitySharePaise({
      electricityCalculationMethod: detail.electricityCalculationMethod,
      electricitySharePaise: detail.electricitySharePaise,
      manualChargePaise: detail.manualChargePaise,
      electricityDeductFromDeposit: detail.electricityDeductFromDeposit,
    });
  }
  const ledger = detail.electricityOperatorAudit?.meterPeriodLedger;
  if (
    ledger &&
    detail.electricityCalculationMethod === 'meter_reading' &&
    detail.electricityDeductFromDeposit !== false
  ) {
    return ledger.suggestedDepositDeductionPaise;
  }
  return detail.preview.electricityDeductionPaise;
}

export function buildOperatorFinalRefundBreakdown(
  detail: CheckoutSettlementDetail,
  electricityDeductionPaise?: number | null,
): OperatorFinalRefundBreakdown {
  const waterfall = detail.waterfall ?? null;
  const electricityPaise = resolveEffectiveCheckoutElectricityDeductionPaise(
    detail,
    electricityDeductionPaise,
  );

  if (!waterfall) {
    const depositReceivedPaise = detail.depositRefundablePaise;
    const otherDeductionsPaise =
      (detail.preview.damageChargePaise ?? 0) +
      (detail.preview.cleaningChargePaise ?? 0) +
      (detail.preview.customChargePaise ?? 0);
    const depositRemainingPaise = Math.max(
      0,
      depositReceivedPaise -
        detail.preview.noticeDeductionPaise -
        (detail.preview.electricityDeductFromDeposit ? electricityPaise : 0) -
        (detail.preview.outstandingRentDeductionPaise ?? 0) -
        otherDeductionsPaise,
    );
    const unusedPrepaidRentPaise = detail.preview.unusedRentRefundPaise ?? 0;
    const finalRefundPaise = Math.max(0, depositRemainingPaise + unusedPrepaidRentPaise);
    return {
      depositReceivedPaise,
      electricityDeductionPaise: detail.preview.electricityDeductFromDeposit ? electricityPaise : 0,
      otherDeductionsPaise,
      depositRemainingPaise,
      unusedPrepaidRentPaise,
      finalRefundPaise,
      waterfall: null,
    };
  }

  const recomputed = computeCheckoutSettlementV2({
    stayCheckInDate: waterfall.stay.checkInDate,
    stayCheckoutDate: waterfall.stay.checkoutDate,
    rentPaidPaise: waterfall.rentBucket.paidPaise,
    monthlyRentPaise: detail.monthlyRentPaiseSnapshot,
    depositCollectedPaise: waterfall.depositBucket.collectedPaise,
    missingNoticeDays: waterfall.notice.missingNoticeDays,
    electricityPaise,
    electricityDeductFromDeposit: detail.preview.electricityDeductFromDeposit !== false,
    damageChargePaise: detail.damageChargePaise,
    cleaningChargePaise: detail.cleaningChargePaise,
    customChargePaise: detail.customChargePaise,
    noticeApplies: noticeDeductionAppliesToBooking({
      stayType: detail.stayType,
      durationMode: detail.durationMode,
    }),
    checkoutTailRentPaise: waterfall.depositBucket.tailRentPaise ?? 0,
    outstandingRentInvoicePaise: waterfall.outstandingRentInvoicePaise ?? 0,
    prepaidAfterVacatingPaise: waterfall.rentBucket.unusedPaise,
    periodDailyRentPaise: waterfall.rentBucket.dailyRentPaise,
  });

  return {
    depositReceivedPaise: recomputed.depositBucket.collectedPaise,
    electricityDeductionPaise: recomputed.depositBucket.electricityPaise,
    otherDeductionsPaise: recomputed.depositBucket.otherPaise,
    depositRemainingPaise: recomputed.depositBucket.refundablePaise,
    unusedPrepaidRentPaise: recomputed.refund.unusedRentPortionPaise,
    finalRefundPaise: recomputed.refund.totalPaise,
    waterfall: recomputed,
  };
}
