import { todayString, normalizeIsoDateOnly, tryDiffDays } from '@/src/lib/dates';
import { isFixedStayDurationMode } from '@/src/lib/checkout/checkoutWorkflow';
import type { VacatingForBookingRow } from '@/src/db/queries/customer';
import {
  computeDepositRefundUnlockState,
  depositRefundEligibilityFromUnlock,
  type DepositRefundUnlockResult,
} from '@/src/lib/billing/depositRefundUnlock';
import { computeNoticeDeduction } from '@/src/services/billing';

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
    createdAt: Date | string;
  } | null;
  settlement?: { status: string; rejectionReason?: string | null } | null;
  residentRequest?: { status: string } | null;
  monthlyRentPaise?: number;
}): DepositRefundEligibility {
  try {
    return computeDepositRefundEligibilitySafe(args);
  } catch {
    return {
      canRequestRefund: false,
      lockReason:
        'We could not verify refund eligibility due to incomplete stay data. Please refresh and try again.',
      unlockState: 'locked',
    };
  }
}

function computeDepositRefundEligibilitySafe(args: {
  vacating: VacatingForBookingRow | null;
  today?: string;
  booking?: {
    status: string;
    durationMode: string;
    expectedCheckoutDate: string | null;
    createdAt: Date | string;
  } | null;
  settlement?: { status: string; rejectionReason?: string | null } | null;
  residentRequest?: { status: string } | null;
  monthlyRentPaise?: number;
}): DepositRefundEligibility {
  const bookingCreatedAt =
    args.booking?.createdAt instanceof Date
      ? args.booking.createdAt
      : typeof args.booking?.createdAt === 'string'
        ? new Date(args.booking.createdAt)
        : null;

  const resolvedCreatedAt =
    bookingCreatedAt && !Number.isNaN(bookingCreatedAt.getTime())
      ? bookingCreatedAt
      : args.booking && isFixedStayDurationMode(args.booking.durationMode)
        ? new Date(0)
        : null;

  if (args.booking && resolvedCreatedAt) {
    const unlock = computeDepositRefundUnlockState({
      booking: {
        ...args.booking,
        expectedCheckoutDate: normalizeIsoDateOnly(args.booking.expectedCheckoutDate ?? '') || null,
        createdAt: resolvedCreatedAt,
      },
      vacating: args.vacating
        ? {
            ...args.vacating,
            noticeGivenDate:
              normalizeIsoDateOnly(args.vacating.noticeGivenDate) || args.vacating.noticeGivenDate,
            vacatingDate:
              normalizeIsoDateOnly(args.vacating.vacatingDate) || args.vacating.vacatingDate,
          }
        : null,
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
        'Submit a move-out request and wait for admin approval before requesting a deposit refund.',
      unlockState: 'locked',
    };
  }

  const unlock = computeDepositRefundUnlockState({
    booking: {
      status: 'confirmed',
      durationMode: 'monthly',
      expectedCheckoutDate: normalizeIsoDateOnly(vacating.vacatingDate) || vacating.vacatingDate,
      createdAt:
        vacating.createdAt instanceof Date ? vacating.createdAt : new Date(String(vacating.createdAt)),
    },
    vacating: {
      ...vacating,
      noticeGivenDate: normalizeIsoDateOnly(vacating.noticeGivenDate) || vacating.noticeGivenDate,
      vacatingDate: normalizeIsoDateOnly(vacating.vacatingDate) || vacating.vacatingDate,
    },
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
  const estimatedDeductionPaise = computeNoticeDeduction(args.monthlyRentPaise, {
    noticeGivenDate,
    vacatingDate: args.vacatingDate,
  });
  const earlyVacate = estimatedDeductionPaise > 0;
  const estimatedRefundablePaise = Math.max(
    0,
    args.depositHeldPaise - estimatedDeductionPaise,
  );
  return { daysUntilVacate, earlyVacate, estimatedDeductionPaise, estimatedRefundablePaise };
}
