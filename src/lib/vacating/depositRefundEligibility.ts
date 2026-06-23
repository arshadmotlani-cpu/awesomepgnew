import { todayString, tryDiffDays } from '@/src/lib/dates';
import type { VacatingForBookingRow } from '@/src/db/queries/customer';
import {
  computeDepositRefundUnlockState,
  depositRefundEligibilityFromUnlock,
  type DepositRefundUnlockResult,
} from '@/src/lib/billing/depositRefundUnlock';
import { VACATING_NOTICE_MIN_DAYS, vacatingPenalty } from '@/src/services/billing';

export type DepositRefundEligibility = {
  canRequestRefund: boolean;
  lockReason: string | null;
  unlockState?: DepositRefundUnlockResult['state'];
};

export function getDepositRefundEligibility(args: {
  vacating: VacatingForBookingRow | null;
  today?: string;
  booking?: {
    status: string;
    durationMode: string;
    expectedCheckoutDate: string | null;
    createdAt: Date;
  } | null;
  settlement?: { status: string } | null;
  residentRequest?: { status: string } | null;
  monthlyRentPaise?: number;
}): DepositRefundEligibility {
  if (args.booking) {
    const unlock = computeDepositRefundUnlockState({
      booking: args.booking,
      vacating: args.vacating,
      settlement: args.settlement ?? null,
      residentRequest: args.residentRequest ?? null,
      monthlyRentPaise: args.monthlyRentPaise,
      today: args.today,
    });
    return { ...depositRefundEligibilityFromUnlock(unlock), unlockState: unlock.state };
  }

  const vacating = args.vacating;
  if (!vacating) {
    return {
      canRequestRefund: false,
      lockReason:
        'Submit a vacate request and wait for admin approval before requesting a deposit refund.',
      unlockState: 'locked',
    };
  }

  const unlock = computeDepositRefundUnlockState({
    booking: {
      status: 'confirmed',
      durationMode: 'monthly',
      expectedCheckoutDate: vacating.vacatingDate,
      createdAt: vacating.createdAt,
    },
    vacating,
    settlement: args.settlement ?? null,
    residentRequest: args.residentRequest ?? null,
    monthlyRentPaise: args.monthlyRentPaise ?? vacating.monthlyRentPaiseSnapshot,
    today: args.today,
  });
  return { ...depositRefundEligibilityFromUnlock(unlock), unlockState: unlock.state };
}

export function estimateVacateDepositPreview(args: {
  depositHeldPaise: number;
  monthlyRentPaise: number;
  vacatingDate: string;
  noticeGivenDate?: string;
}) {
  const noticeGivenDate = args.noticeGivenDate ?? todayString();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.vacatingDate)) {
    return {
      daysUntilVacate: 0,
      earlyVacate: false,
      estimatedDeductionPaise: 0,
      estimatedRefundablePaise: args.depositHeldPaise,
    };
  }
  const daysUntilVacate = tryDiffDays(noticeGivenDate, args.vacatingDate) ?? 0;
  const earlyVacate = daysUntilVacate < VACATING_NOTICE_MIN_DAYS;
  const estimatedDeductionPaise = earlyVacate ? vacatingPenalty(args.monthlyRentPaise) : 0;
  const estimatedRefundablePaise = Math.max(
    0,
    args.depositHeldPaise - estimatedDeductionPaise,
  );
  return { daysUntilVacate, earlyVacate, estimatedDeductionPaise, estimatedRefundablePaise };
}
