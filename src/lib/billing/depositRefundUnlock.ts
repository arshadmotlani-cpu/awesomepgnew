/**
 * Unified deposit refund unlock state — monthly vacating + fixed-stay checkout.
 */

import { formatDate, parseDate, todayString, type DateLike } from '@/src/lib/dates';
import type { VacatingForBookingRow } from '@/src/db/queries/customer';
import { isFixedStayDurationMode, isMonthlyDurationMode } from '@/src/lib/checkout/checkoutWorkflow';
import { computeNoticeDeduction } from '@/src/services/billing';

export type DepositRefundUnlockState =
  | 'locked'
  | 'unlocked'
  | 'submitted'
  | 'approved'
  | 'paid'
  | 'rejected';

export type DepositRefundUnlockResult = {
  state: DepositRefundUnlockState;
  canRequestRefund: boolean;
  lockReason: string | null;
  unlockDate: string | null;
  estimatedNoticeDeductionPaise: number;
};

type BookingContext = {
  status: string;
  durationMode: string;
  expectedCheckoutDate: string | null;
  createdAt: Date;
};

type SettlementContext = {
  status: string;
  rejectionReason?: string | null;
} | null;

type ResidentRequestContext = {
  status: string;
} | null;

export function estimateNoticeDeductionPaise(args: {
  monthlyRentPaise: number;
  noticeGivenDate: DateLike;
  vacatingDate: DateLike;
}): number {
  return computeNoticeDeduction(args.monthlyRentPaise, {
    noticeGivenDate: args.noticeGivenDate,
    vacatingDate: args.vacatingDate,
  });
}

/**
 * Compute unlock state from booking lifecycle, vacating, settlement, and resident request.
 */
export function computeDepositRefundUnlockState(args: {
  booking: BookingContext;
  vacating: VacatingForBookingRow | null;
  settlement: SettlementContext;
  residentRequest: ResidentRequestContext;
  monthlyRentPaise?: number;
  today?: string;
  now?: Date;
}): DepositRefundUnlockResult {
  const today = args.today ?? todayString();
  const monthlyRent = args.monthlyRentPaise ?? 0;
  const fixedStay = isFixedStayDurationMode(args.booking.durationMode);
  const monthly = isMonthlyDurationMode(args.booking.durationMode);

  if (
    args.settlement?.status === 'refund_paid' ||
    args.settlement?.status === 'completed' ||
    (args.booking.status === 'completed' && args.vacating?.status === 'completed')
  ) {
    return {
      state: 'paid',
      canRequestRefund: false,
      lockReason: null,
      unlockDate: null,
      estimatedNoticeDeductionPaise: 0,
    };
  }

  if (
    args.settlement?.status === 'approved' ||
    args.settlement?.status === 'refund_pending' ||
    args.residentRequest?.status === 'approved'
  ) {
    return {
      state: 'approved',
      canRequestRefund: false,
      lockReason: 'Your refund is approved and being processed.',
      unlockDate: null,
      estimatedNoticeDeductionPaise: 0,
    };
  }

  if (
    args.residentRequest?.status === 'submitted' ||
    args.residentRequest?.status === 'under_review' ||
    args.settlement?.status === 'awaiting_admin_review'
  ) {
    return {
      state: 'submitted',
      canRequestRefund: false,
      lockReason: 'Your refund request is under admin review.',
      unlockDate: null,
      estimatedNoticeDeductionPaise: 0,
    };
  }

  if (args.settlement?.status === 'awaiting_resident_details') {
    const rejection = args.settlement.rejectionReason?.trim();
    if (rejection) {
      return {
        state: 'rejected',
        canRequestRefund: true,
        lockReason: `Please fix and resubmit your refund request. ${rejection}`,
        unlockDate: null,
        estimatedNoticeDeductionPaise: 0,
      };
    }
  }

  if (args.residentRequest?.status === 'rejected' && !args.settlement) {
    return {
      state: 'rejected',
      canRequestRefund: true,
      lockReason: 'Your previous refund request was declined. You may submit again with corrected details.',
      unlockDate: null,
      estimatedNoticeDeductionPaise: 0,
    };
  }

  const checkoutDate =
    args.booking.expectedCheckoutDate ?? args.vacating?.vacatingDate ?? null;

  let estimatedNoticeDeductionPaise = 0;
  if (monthly && checkoutDate && monthlyRent > 0 && args.vacating) {
    estimatedNoticeDeductionPaise = estimateNoticeDeductionPaise({
      monthlyRentPaise: monthlyRent,
      noticeGivenDate: args.vacating.noticeGivenDate,
      vacatingDate: checkoutDate,
    });
  }

  if (fixedStay) {
    if (args.booking.status === 'confirmed' || args.booking.status === 'completed') {
      return {
        state: 'unlocked',
        canRequestRefund: true,
        lockReason: null,
        unlockDate: checkoutDate,
        estimatedNoticeDeductionPaise: 0,
      };
    }
    return {
      state: 'locked',
      canRequestRefund: false,
      lockReason: 'Refund is available once your stay is active.',
      unlockDate: checkoutDate,
      estimatedNoticeDeductionPaise: 0,
    };
  }

  if (!args.vacating) {
    return {
      state: 'locked',
      canRequestRefund: false,
      lockReason: 'Submit a move-out request and wait for admin approval before requesting a deposit refund.',
      unlockDate: checkoutDate,
      estimatedNoticeDeductionPaise,
    };
  }

  if (args.vacating.status === 'pending') {
    return {
      state: 'locked',
      canRequestRefund: false,
      lockReason: 'Deposit refund unlocks after admin approves your move-out request and your move-out date arrives.',
      unlockDate: args.vacating.vacatingDate,
      estimatedNoticeDeductionPaise,
    };
  }

  if (args.vacating.status === 'rejected') {
    return {
      state: 'rejected',
      canRequestRefund: false,
      lockReason: 'Your move-out request was not approved. Submit a new move-out request first.',
      unlockDate: null,
      estimatedNoticeDeductionPaise: 0,
    };
  }

  if (args.vacating.status !== 'approved' && args.vacating.status !== 'completed') {
    return {
      state: 'locked',
      canRequestRefund: false,
      lockReason: 'Move-out request must be approved first.',
      unlockDate: args.vacating.vacatingDate,
      estimatedNoticeDeductionPaise,
    };
  }

  if (today < args.vacating.vacatingDate) {
    return {
      state: 'locked',
      canRequestRefund: false,
      lockReason: `Request Refund unlocks on your approved move-out date (${formatDate(parseDate(args.vacating.vacatingDate))}).`,
      unlockDate: args.vacating.vacatingDate,
      estimatedNoticeDeductionPaise,
    };
  }

  return {
    state: 'unlocked',
    canRequestRefund: true,
    lockReason: null,
    unlockDate: args.vacating.vacatingDate,
    estimatedNoticeDeductionPaise,
  };
}

/** Back-compat wrapper for existing eligibility callers. */
export function depositRefundEligibilityFromUnlock(
  unlock: DepositRefundUnlockResult,
): { canRequestRefund: boolean; lockReason: string | null } {
  return {
    canRequestRefund: unlock.canRequestRefund,
    lockReason: unlock.lockReason,
  };
}
