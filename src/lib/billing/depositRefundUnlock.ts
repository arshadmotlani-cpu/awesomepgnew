/**
 * Unified deposit refund unlock state — monthly vacating + fixed-stay checkout.
 */

import { formatDate, parseDate, todayString, type DateLike } from '@/src/lib/dates';
import { fixedStayRefundUnlockLabel, isPastFixedStayCheckout } from '@/src/lib/dates/ist';
import type { VacatingForBookingRow } from '@/src/db/queries/customer';
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
} | null;

type ResidentRequestContext = {
  status: string;
} | null;

function isFixedStayMode(durationMode: string): boolean {
  return ['fixed_stay', 'daily', 'weekly'].includes(durationMode);
}

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

  if (args.residentRequest?.status === 'rejected') {
    return {
      state: 'rejected',
      canRequestRefund: false,
      lockReason: 'Your deposit refund request was declined. Contact the office for help.',
      unlockDate: null,
      estimatedNoticeDeductionPaise: 0,
    };
  }

  if (
    args.settlement?.status === 'refund_paid' ||
    args.settlement?.status === 'completed' ||
    args.booking.status === 'completed' && args.vacating?.status === 'completed'
  ) {
    const paid =
      args.settlement?.status === 'refund_paid' ||
      args.settlement?.status === 'completed' ||
      (args.vacating?.depositRefundPaise ?? 0) > 0;
    if (paid) {
      return {
        state: 'paid',
        canRequestRefund: false,
        lockReason: null,
        unlockDate: null,
        estimatedNoticeDeductionPaise: 0,
      };
    }
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

  const fixedStay = isFixedStayMode(args.booking.durationMode);
  const checkoutDate =
    args.booking.expectedCheckoutDate ??
    args.vacating?.vacatingDate ??
    null;

  let estimatedNoticeDeductionPaise = 0;
  if (checkoutDate && monthlyRent > 0) {
    const noticeGiven =
      args.vacating?.noticeGivenDate ?? formatDate(parseDate(args.booking.createdAt));
    estimatedNoticeDeductionPaise = estimateNoticeDeductionPaise({
      monthlyRentPaise: monthlyRent,
      noticeGivenDate: noticeGiven,
      vacatingDate: checkoutDate,
    });
  }

  if (fixedStay && checkoutDate) {
    const pastCheckout = isPastFixedStayCheckout(checkoutDate, args.now);
    if (pastCheckout && args.booking.status === 'completed') {
      return {
        state: 'unlocked',
        canRequestRefund: true,
        lockReason: null,
        unlockDate: checkoutDate,
        estimatedNoticeDeductionPaise,
      };
    }
    if (!pastCheckout) {
      return {
        state: 'locked',
        canRequestRefund: false,
        lockReason: fixedStayRefundUnlockLabel(checkoutDate),
        unlockDate: checkoutDate,
        estimatedNoticeDeductionPaise,
      };
    }
    if (pastCheckout && args.booking.status === 'confirmed') {
      return {
        state: 'locked',
        canRequestRefund: false,
        lockReason:
          'Your stay checkout is being processed. Deposit refund will unlock shortly after 11 AM on your checkout date.',
        unlockDate: checkoutDate,
        estimatedNoticeDeductionPaise,
      };
    }
  }

  if (!args.vacating) {
    return {
      state: 'locked',
      canRequestRefund: false,
      lockReason: fixedStay
        ? checkoutDate
          ? fixedStayRefundUnlockLabel(checkoutDate)
          : 'Deposit refund unlocks after your stay checkout.'
        : 'Submit a vacate request and wait for admin approval before requesting a deposit refund.',
      unlockDate: checkoutDate,
      estimatedNoticeDeductionPaise,
    };
  }

  if (args.vacating.status === 'pending') {
    return {
      state: 'locked',
      canRequestRefund: false,
      lockReason:
        'Deposit refund unlocks after admin approves your vacate request and your vacate date arrives.',
      unlockDate: args.vacating.vacatingDate,
      estimatedNoticeDeductionPaise,
    };
  }

  if (args.vacating.status === 'rejected') {
    return {
      state: 'rejected',
      canRequestRefund: false,
      lockReason: 'Your vacate request was not approved. Contact the office for help.',
      unlockDate: null,
      estimatedNoticeDeductionPaise: 0,
    };
  }

  if (args.vacating.status !== 'approved' && args.vacating.status !== 'completed') {
    return {
      state: 'locked',
      canRequestRefund: false,
      lockReason: 'Vacate request must be approved first.',
      unlockDate: args.vacating.vacatingDate,
      estimatedNoticeDeductionPaise,
    };
  }

  if (today < args.vacating.vacatingDate) {
    return {
      state: 'locked',
      canRequestRefund: false,
      lockReason: fixedStayRefundUnlockLabel(args.vacating.vacatingDate),
      unlockDate: args.vacating.vacatingDate,
      estimatedNoticeDeductionPaise,
    };
  }

  if (
    args.settlement?.status === 'awaiting_resident_details' ||
    args.vacating.status === 'approved' ||
    args.vacating.status === 'completed'
  ) {
    return {
      state: 'unlocked',
      canRequestRefund: true,
      lockReason: null,
      unlockDate: args.vacating.vacatingDate,
      estimatedNoticeDeductionPaise,
    };
  }

  return {
    state: 'locked',
    canRequestRefund: false,
    lockReason: 'Deposit refund is not available yet.',
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
