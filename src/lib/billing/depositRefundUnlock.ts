/**
 * Unified deposit refund unlock state — monthly vacating + fixed-stay checkout.
 */

import { normalizeIsoDateOnly, todayString, type DateLike } from '@/src/lib/dates';
import { formatDate as formatDisplayDate } from '@/src/lib/format';
import type { VacatingForBookingRow } from '@/src/db/queries/customer';
import { isFixedStayDurationMode, isMonthlyDurationMode } from '@/src/lib/checkout/checkoutWorkflow';
import {
  isBookingLifecycleCheckedOut,
  isImmediateRefundCheckoutSource,
} from '@/src/lib/checkout/checkoutSource';
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
  createdAt: Date | string;
};

function dateOnly(value: string | null | undefined): string | null {
  const normalized = normalizeIsoDateOnly(value ?? '');
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null;
}

function displayDateLabel(value: string | null | undefined): string {
  return formatDisplayDate(value);
}

type SettlementContext = {
  status: string;
  rejectionReason?: string | null;
  checkoutSource?: string | null;
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
  /** When false, resident has checked out — refund unlocks without new move-out request (CASE B). */
  hasActiveBedToday?: boolean;
}): DepositRefundUnlockResult {
  const today = args.today ?? todayString();
  const monthlyRent = args.monthlyRentPaise ?? 0;
  const fixedStay = isFixedStayDurationMode(args.booking.durationMode);
  const monthly = isMonthlyDurationMode(args.booking.durationMode);

  if (
    args.settlement?.status === 'refund_paid' ||
    args.settlement?.status === 'completed'
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
    dateOnly(args.booking.expectedCheckoutDate) ?? dateOnly(args.vacating?.vacatingDate) ?? null;
  const vacatingDate = dateOnly(args.vacating?.vacatingDate);

  let estimatedNoticeDeductionPaise = 0;
  const noticeGivenDate = dateOnly(args.vacating?.noticeGivenDate);
  if (monthly && checkoutDate && noticeGivenDate && monthlyRent > 0 && args.vacating) {
    try {
      estimatedNoticeDeductionPaise = estimateNoticeDeductionPaise({
        monthlyRentPaise: monthlyRent,
        noticeGivenDate,
        vacatingDate: checkoutDate,
      });
    } catch {
      estimatedNoticeDeductionPaise = 0;
    }
  }

  const checkedOut = isBookingLifecycleCheckedOut({
    bookingStatus: args.booking.status,
    hasActiveBedToday: args.hasActiveBedToday,
    checkoutSource: args.settlement?.checkoutSource,
    settlementStatus: args.settlement?.status,
  });

  const residentStillOccupiesBed = (): boolean => {
    if (checkedOut) return false;
    if (args.hasActiveBedToday === true) return true;
    if (args.hasActiveBedToday === false) return false;
    if (args.booking.status === 'completed') return false;
    if (args.vacating?.status === 'completed') return false;
    if (args.vacating?.status === 'approved' && vacatingDate && today >= vacatingDate) return false;
    return args.booking.status === 'confirmed';
  };

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

  if (monthly && !residentStillOccupiesBed()) {
    return {
      state: 'unlocked',
      canRequestRefund: true,
      lockReason: null,
      unlockDate: vacatingDate ?? checkoutDate,
      estimatedNoticeDeductionPaise,
    };
  }

  if (
    monthly &&
    checkedOut &&
    isImmediateRefundCheckoutSource(args.settlement?.checkoutSource) &&
    !args.vacating
  ) {
    return {
      state: 'unlocked',
      canRequestRefund: true,
      lockReason: null,
      unlockDate: checkoutDate,
      estimatedNoticeDeductionPaise: 0,
    };
  }

  if (!args.vacating) {
    return {
      state: 'locked',
      canRequestRefund: false,
      lockReason: 'Submit a move-out request first.',
      unlockDate: checkoutDate,
      estimatedNoticeDeductionPaise,
    };
  }

  if (args.vacating.status === 'pending') {
    const vacateDate = dateOnly(args.vacating.vacatingDate);
    return {
      state: 'locked',
      canRequestRefund: false,
      lockReason: 'Deposit refund unlocks after admin approves your move-out request and your move-out date arrives.',
      unlockDate: vacateDate,
      estimatedNoticeDeductionPaise,
    };
  }

  if (args.vacating.status === 'rejected') {
    if (!residentStillOccupiesBed()) {
      return {
        state: 'unlocked',
        canRequestRefund: true,
        lockReason: null,
        unlockDate: vacatingDate ?? checkoutDate,
        estimatedNoticeDeductionPaise: 0,
      };
    }
    return {
      state: 'rejected',
      canRequestRefund: false,
      lockReason: 'Your move-out request was not approved. Submit a new move-out request first.',
      unlockDate: null,
      estimatedNoticeDeductionPaise: 0,
    };
  }

  if (args.vacating.status !== 'approved' && args.vacating.status !== 'completed') {
    const vacateDate = dateOnly(args.vacating.vacatingDate);
    return {
      state: 'locked',
      canRequestRefund: false,
      lockReason: 'Move-out request must be approved first.',
      unlockDate: vacateDate,
      estimatedNoticeDeductionPaise,
    };
  }

  const vacatingDateFinal = dateOnly(args.vacating.vacatingDate);
  if (vacatingDateFinal && today < vacatingDateFinal) {
    return {
      state: 'locked',
      canRequestRefund: false,
      lockReason: `Request Refund unlocks on your approved move-out date (${displayDateLabel(vacatingDateFinal)}).`,
      unlockDate: vacatingDateFinal,
      estimatedNoticeDeductionPaise,
    };
  }

  return {
    state: 'unlocked',
    canRequestRefund: true,
    lockReason: null,
    unlockDate: vacatingDateFinal,
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
