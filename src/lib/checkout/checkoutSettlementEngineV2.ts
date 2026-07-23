/**
 * Checkout Settlement Engine V2 — two-bucket waterfall (unused rent first, then deposit).
 *
 * Settlement order:
 * 1. Stay dates → 2. Rent bucket → 3. Notice (full) → 4. Notice from rent then deposit
 * → 5. Electricity from deposit → 6. Other from deposit → 7. Total refund
 */
import { diffDays } from '@/src/lib/dates';
import { guardDepositPaise } from '@/src/lib/deposits/paiseSafety';
import { dailyRateFromMonthly } from '@/src/services/billing';

export type CheckoutSettlementWaterfallLine = {
  step: number;
  label: string;
  amountPaise: number;
  explanation: string;
};

export type CheckoutSettlementWaterfall = {
  engineVersion: 2;
  stay: {
    checkInDate: string;
    checkoutDate: string;
    stayDays: number;
  };
  rentBucket: {
    paidPaise: number;
    consumedPaise: number;
    unusedPaise: number;
    dailyRentPaise: number;
  };
  notice: {
    missingNoticeDays: number;
    fullPaise: number;
    fromUnusedRentPaise: number;
    fromDepositPaise: number;
    unusedRentRemainingPaise: number;
  };
  depositBucket: {
    collectedPaise: number;
    electricityPaise: number;
    otherPaise: number;
    refundablePaise: number;
  };
  refund: {
    depositPortionPaise: number;
    unusedRentPortionPaise: number;
    totalPaise: number;
  };
  lines: CheckoutSettlementWaterfallLine[];
};

export type CheckoutSettlementV2Input = {
  stayCheckInDate: string;
  stayCheckoutDate: string;
  rentPaidPaise: number;
  monthlyRentPaise: number;
  depositCollectedPaise: number;
  missingNoticeDays: number;
  electricityPaise?: number;
  electricityDeductFromDeposit?: boolean;
  damageChargePaise?: number;
  cleaningChargePaise?: number;
  customChargePaise?: number;
  /** When false (fixed-stay), notice step is skipped. */
  noticeApplies?: boolean;
};

function stayDaysInclusive(checkIn: string, checkout: string): number {
  const span = diffDays(checkIn, checkout);
  return Math.max(1, span + 1);
}

export function computeCheckoutSettlementV2(
  input: CheckoutSettlementV2Input,
): CheckoutSettlementWaterfall {
  const rentPaidPaise = guardDepositPaise(input.rentPaidPaise);
  const depositCollectedPaise = guardDepositPaise(input.depositCollectedPaise);
  const monthlyRentPaise = guardDepositPaise(input.monthlyRentPaise);
  const dailyRentPaise = dailyRateFromMonthly(monthlyRentPaise);
  const stayDays = stayDaysInclusive(input.stayCheckInDate, input.stayCheckoutDate);

  const rentConsumedRaw = dailyRentPaise * stayDays;
  const rentConsumedPaise = Math.min(rentPaidPaise, guardDepositPaise(rentConsumedRaw));
  const unusedRentPaise = Math.max(0, rentPaidPaise - rentConsumedPaise);

  const noticeApplies = input.noticeApplies !== false;
  const missingNoticeDays = noticeApplies
    ? Math.max(0, Math.floor(input.missingNoticeDays))
    : 0;
  const noticeFullPaise = noticeApplies
    ? guardDepositPaise(missingNoticeDays * dailyRentPaise)
    : 0;

  const noticeFromUnusedRentPaise = Math.min(unusedRentPaise, noticeFullPaise);
  const noticeFromDepositPaise = Math.max(0, noticeFullPaise - noticeFromUnusedRentPaise);
  const unusedRentAfterNoticePaise = Math.max(
    0,
    unusedRentPaise - noticeFromUnusedRentPaise,
  );

  const electricityPaise =
    input.electricityDeductFromDeposit === false
      ? 0
      : guardDepositPaise(input.electricityPaise ?? 0);
  const otherPaise =
    guardDepositPaise(input.damageChargePaise ?? 0) +
    guardDepositPaise(input.cleaningChargePaise ?? 0) +
    guardDepositPaise(input.customChargePaise ?? 0);

  let depositRemaining = depositCollectedPaise;
  depositRemaining -= noticeFromDepositPaise;
  depositRemaining -= electricityPaise;
  depositRemaining -= otherPaise;
  const depositRefundablePaise = Math.max(0, guardDepositPaise(depositRemaining));

  const totalRefundPaise = guardDepositPaise(
    depositRefundablePaise + unusedRentAfterNoticePaise,
  );

  const lines: CheckoutSettlementWaterfallLine[] = [
    {
      step: 1,
      label: 'Stay',
      amountPaise: stayDays,
      explanation: `${input.stayCheckInDate} → ${input.stayCheckoutDate} (${stayDays} day${stayDays === 1 ? '' : 's'})`,
    },
    {
      step: 2,
      label: 'Rent paid',
      amountPaise: rentPaidPaise,
      explanation: 'Total rent received for this booking',
    },
    {
      step: 2,
      label: 'Rent consumed',
      amountPaise: rentConsumedPaise,
      explanation: `${stayDays} day${stayDays === 1 ? '' : 's'} × daily rent (${dailyRentPaise} paise/day)`,
    },
    {
      step: 2,
      label: 'Unused rent',
      amountPaise: unusedRentPaise,
      explanation: 'Rent paid minus rent consumed for actual stay',
    },
    {
      step: 3,
      label: 'Notice deduction (full)',
      amountPaise: noticeFullPaise,
      explanation:
        missingNoticeDays > 0
          ? `${missingNoticeDays} missing notice day${missingNoticeDays === 1 ? '' : 's'} × daily rent`
          : 'Notice period satisfied — no notice charge',
    },
    {
      step: 4,
      label: 'Taken from unused rent',
      amountPaise: noticeFromUnusedRentPaise,
      explanation: 'Notice charge applied to rent bucket first',
    },
    {
      step: 4,
      label: 'Taken from deposit',
      amountPaise: noticeFromDepositPaise,
      explanation: 'Notice remainder charged to deposit',
    },
    {
      step: 4,
      label: 'Unused rent remaining',
      amountPaise: unusedRentAfterNoticePaise,
      explanation: 'Rent credit included in resident refund',
    },
    {
      step: 5,
      label: 'Deposit collected',
      amountPaise: depositCollectedPaise,
      explanation: 'Deposit escrow balance before checkout deductions',
    },
    {
      step: 5,
      label: 'Electricity deduction',
      amountPaise: electricityPaise,
      explanation: 'Final electricity share from deposit',
    },
    {
      step: 6,
      label: 'Other deductions',
      amountPaise: otherPaise,
      explanation: 'Damage, cleaning, and custom charges',
    },
    {
      step: 7,
      label: 'Refundable deposit',
      amountPaise: depositRefundablePaise,
      explanation: 'Deposit remaining after all deposit-bucket charges',
    },
    {
      step: 7,
      label: 'Total refund',
      amountPaise: totalRefundPaise,
      explanation: 'Refundable deposit + unused rent credit (single payout)',
    },
  ];

  return {
    engineVersion: 2,
    stay: {
      checkInDate: input.stayCheckInDate,
      checkoutDate: input.stayCheckoutDate,
      stayDays,
    },
    rentBucket: {
      paidPaise: rentPaidPaise,
      consumedPaise: rentConsumedPaise,
      unusedPaise: unusedRentPaise,
      dailyRentPaise,
    },
    notice: {
      missingNoticeDays,
      fullPaise: noticeFullPaise,
      fromUnusedRentPaise: noticeFromUnusedRentPaise,
      fromDepositPaise: noticeFromDepositPaise,
      unusedRentRemainingPaise: unusedRentAfterNoticePaise,
    },
    depositBucket: {
      collectedPaise: depositCollectedPaise,
      electricityPaise,
      otherPaise,
      refundablePaise: depositRefundablePaise,
    },
    refund: {
      depositPortionPaise: depositRefundablePaise,
      unusedRentPortionPaise: unusedRentAfterNoticePaise,
      totalPaise: totalRefundPaise,
    },
    lines,
  };
}

/** Map V2 waterfall to checkout_settlements column patch (unlocked rows only). */
export function checkoutSettlementV2ColumnPatch(
  waterfall: CheckoutSettlementWaterfall,
): Record<string, unknown> {
  return {
    settlementEngineVersion: 2,
    stayCheckInDate: waterfall.stay.checkInDate,
    stayCheckoutDate: waterfall.stay.checkoutDate,
    stayDays: waterfall.stay.stayDays,
    rentPaidPaise: waterfall.rentBucket.paidPaise,
    rentConsumedPaise: waterfall.rentBucket.consumedPaise,
    unusedRentPaise: waterfall.rentBucket.unusedPaise,
    noticeDeductionFullPaise: waterfall.notice.fullPaise,
    noticeFromUnusedRentPaise: waterfall.notice.fromUnusedRentPaise,
    noticeFromDepositPaise: waterfall.notice.fromDepositPaise,
    unusedRentAfterNoticePaise: waterfall.notice.unusedRentRemainingPaise,
    electricityFromDepositPaise: waterfall.depositBucket.electricityPaise,
    otherFromDepositPaise: waterfall.depositBucket.otherPaise,
    depositRefundablePaise: waterfall.depositBucket.refundablePaise,
    unusedRentRefundPaise: waterfall.refund.unusedRentPortionPaise,
    totalRefundPaise: waterfall.refund.totalPaise,
    settlementWaterfallJson: waterfall,
    noticeDeductionPaise: waterfall.notice.fromDepositPaise,
  };
}

/** Deduction rows for deposit_ledger at approval — deposit bucket only. */
export function buildCheckoutSettlementV2DeductionPlan(
  waterfall: CheckoutSettlementWaterfall,
  labels?: { customChargeLabel?: string | null },
): Array<{ amountPaise: number; reason: string }> {
  const deductions: Array<{ amountPaise: number; reason: string }> = [];
  if (waterfall.notice.fromDepositPaise > 0) {
    deductions.push({
      amountPaise: waterfall.notice.fromDepositPaise,
      reason: `Notice period fee (${waterfall.notice.missingNoticeDays} missing day${waterfall.notice.missingNoticeDays === 1 ? '' : 's'} — deposit portion)`,
    });
  }
  if (waterfall.depositBucket.electricityPaise > 0) {
    deductions.push({
      amountPaise: waterfall.depositBucket.electricityPaise,
      reason: 'Electricity share at checkout',
    });
  }
  const damage = waterfall.depositBucket.otherPaise;
  if (damage > 0) {
    deductions.push({
      amountPaise: damage,
      reason: labels?.customChargeLabel
        ? `Checkout charges (${labels.customChargeLabel})`
        : 'Checkout charges (damage / cleaning / custom)',
    });
  }
  return deductions;
}
