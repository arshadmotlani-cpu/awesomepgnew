/**
 * Resident move-out journey — 6-stage SSOT.
 *
 * Design defaults (2026-07-23):
 * - Stage 5 label "Refund Approved" covers admin approval through payout.
 * - Stage 3 shows notice estimate only; full breakdown after refund submit (stage 4+).
 * - Suppressed checkout: resident sees office-handled copy (see vacatingNextStep).
 * - Revert vacating approval archives open settlement (vacating.ts).
 */
import type { VacatingForBookingRow } from '@/src/db/queries/customer';
import { todayString } from '@/src/lib/dates';
import { fixedStayRefundUnlockLabel, isPastFixedStayCheckout } from '@/src/lib/dates/ist';
import { formatDate } from '@/src/lib/format';
import { isFixedStayDurationMode } from '@/src/lib/checkout/checkoutWorkflow';
import {
  RESIDENT_MOVE_OUT_COMPLETED,
  RESIDENT_WAITING_METER_UPI_ON_VACATE_DATE,
  RESIDENT_WAITING_PG_VERIFICATION,
} from '@/src/lib/moveOut/moveOutWorkflowStages';

export type VacatingStageId =
  | 'requested'
  | 'admin_approval'
  | 'refund_request'
  | 'settlement_review'
  | 'refund_approved'
  | 'completed';

export type VacatingStage = {
  id: VacatingStageId;
  label: string;
  residentHint: string;
};

export const VACATING_JOURNEY_STAGES: VacatingStage[] = [
  {
    id: 'requested',
    label: 'Move-out Requested',
    residentHint: 'Submit your move-out date with room and electricity meter photos.',
  },
  {
    id: 'admin_approval',
    label: 'Waiting for Admin Approval',
    residentHint: 'The office is reviewing your move-out date and notice period.',
  },
  {
    id: 'refund_request',
    label: 'Waiting for Refund Request',
    residentHint: 'After your move-out date, submit your UPI QR and final AC meter photo here.',
  },
  {
    id: 'settlement_review',
    label: 'Settlement Under Review',
    residentHint: 'We are verifying your meter reading and calculating your final refund.',
  },
  {
    id: 'refund_approved',
    label: 'Refund Approved',
    residentHint: 'Your refund amount is confirmed. Payout is being processed.',
  },
  {
    id: 'completed',
    label: 'Move-out Completed',
    residentHint: 'Your stay is closed and any refund has been sent.',
  },
];

export type VacatingStageIndexInput = {
  vacatingStatus: string | null;
  checkoutStatus: string | null;
  vacatingDate?: string | null;
  today?: string;
  /** Fixed-stay skips admin approval stage. */
  durationMode?: string | null;
  /** When true, checkout is suppressed after approval — timeline pauses at refund request. */
  checkoutSettlementSuppressed?: boolean;
  /** Used to skip Refund Approved when refund is zero. */
  finalRefundPaise?: number | null;
};

export function vacatingStageIndex(input: VacatingStageIndexInput): number {
  const {
    vacatingStatus,
    checkoutStatus,
    vacatingDate,
    durationMode,
    checkoutSettlementSuppressed,
    finalRefundPaise,
  } = input;
  const todayStr = input.today ?? todayString();
  const fixedStay = isFixedStayDurationMode(durationMode ?? undefined);

  if (checkoutStatus === 'completed' || checkoutStatus === 'archived') return 5;
  if (checkoutStatus === 'refund_paid') return 5;
  if (vacatingStatus === 'completed') return 5;

  if (checkoutStatus === 'refund_pending') {
    if (finalRefundPaise != null && finalRefundPaise <= 0) return 5;
    return 4;
  }

  if (checkoutStatus === 'awaiting_admin_review') return 3;

  // Pending vacating never advances past admin approval — even if orphan settlement exists.
  if (vacatingStatus === 'pending') return 1;

  if (checkoutSettlementSuppressed && vacatingStatus === 'approved') {
    return 2;
  }

  if (vacatingStatus === 'approved') {
    if (checkoutStatus === 'awaiting_resident_details') {
      return 2;
    }
    const vacDate = vacatingDate?.slice(0, 10);
    if (vacDate && todayStr < vacDate) return 2;
    if (!checkoutStatus) return 2;
  }

  if (fixedStay && !vacatingStatus && checkoutStatus === 'awaiting_resident_details') {
    return 2;
  }

  if (!vacatingStatus) return 0;

  if (vacatingStatus === 'rejected') return 0;

  return fixedStay && vacatingStatus === 'approved' ? 2 : 0;
}

export function canRequestMoveOutRefund(input: {
  vacatingStatus: string | null;
  vacatingDate?: string | null;
  checkoutStatus: string | null;
  checkoutSettlementSuppressed?: boolean;
  today?: string;
}): { allowed: boolean; reason: string | null } {
  if (input.checkoutSettlementSuppressed) {
    return {
      allowed: false,
      reason: 'Your checkout is being handled by the office. Contact management if you have questions.',
    };
  }
  if (input.vacatingStatus === 'pending') {
    return {
      allowed: false,
      reason: 'Move-out must be approved before you can request a refund.',
    };
  }
  if (input.vacatingStatus !== 'approved' && input.vacatingStatus !== 'completed') {
    return {
      allowed: false,
      reason: 'Submit and get your move-out request approved first.',
    };
  }
  const vacDate = input.vacatingDate?.slice(0, 10);
  const todayStr = input.today ?? todayString();
  if (vacDate && todayStr < vacDate) {
    return {
      allowed: false,
      reason: `Refund request unlocks on your approved move-out date (${formatDate(vacDate)}).`,
    };
  }
  if (
    input.checkoutStatus === 'awaiting_admin_review' ||
    input.checkoutStatus === 'refund_pending' ||
    input.checkoutStatus === 'refund_paid' ||
    input.checkoutStatus === 'completed'
  ) {
    return {
      allowed: false,
      reason: 'Your refund request is already submitted and under review.',
    };
  }
  return { allowed: true, reason: null };
}

export function vacatingStatusLabel(status: VacatingForBookingRow['status'] | null): string {
  switch (status) {
    case 'pending':
      return 'Pending admin approval';
    case 'approved':
      return 'Vacate approved';
    case 'completed':
      return 'Move-out complete';
    case 'rejected':
      return 'Notice declined';
    default:
      return 'No move-out notice yet';
  }
}

export function vacatingNextStep(args: {
  vacating: VacatingForBookingRow | null;
  checkoutStatus: string | null;
  durationMode?: string;
  expectedCheckoutDate?: string | null;
  estimatedFinalRefundPaise?: number | null;
  checkoutSettlementSuppressed?: boolean;
}): { headline: string; detail: string } {
  const {
    vacating,
    checkoutStatus,
    durationMode,
    expectedCheckoutDate,
    estimatedFinalRefundPaise,
    checkoutSettlementSuppressed,
  } = args;
  const zeroRefundDue =
    estimatedFinalRefundPaise != null && estimatedFinalRefundPaise <= 0;
  const fixedStay = durationMode && ['fixed_stay', 'daily', 'weekly'].includes(durationMode);

  if (checkoutSettlementSuppressed && vacating?.status === 'approved') {
    return {
      headline: 'Checkout handled by the office',
      detail:
        'Your continuous stay checkout does not use the self-service refund flow. Contact management for your deposit settlement.',
    };
  }

  if (fixedStay && expectedCheckoutDate) {
    if (checkoutStatus === 'awaiting_resident_details') {
      if (zeroRefundDue) {
        return {
          headline: 'Checkout in progress',
          detail:
            'Your deposit covers notice and electricity charges — no refund is due. We will close your checkout once admin finalises the settlement.',
        };
      }
      return {
        headline: 'Request deposit refund',
        detail: 'Submit your final AC meter photo and UPI QR code to request your deposit refund.',
      };
    }
    if (!isPastFixedStayCheckout(expectedCheckoutDate)) {
      return {
        headline: 'Stay in progress',
        detail: fixedStayRefundUnlockLabel(expectedCheckoutDate),
      };
    }
    if (checkoutStatus === 'awaiting_admin_review' || checkoutStatus === 'refund_pending') {
      return {
        headline: 'Settlement under review',
        detail: 'We are finalising your refund. No action needed from you right now.',
      };
    }
    if (checkoutStatus === 'refund_paid' || checkoutStatus === 'completed') {
      return {
        headline: 'Move-out complete',
        detail: 'Your stay is closed. Check your payment history for the refund receipt.',
      };
    }
  }

  if (!vacating) {
    return {
      headline: 'Request move-out',
      detail: 'Submit your vacate date with room and electricity meter photos. Admin approves before settlement.',
    };
  }

  if (vacating.status === 'pending') {
    return {
      headline: 'Waiting for admin approval',
      detail: 'Your move-out request is pending. Refund and final charges are calculated only after the office approves your date.',
    };
  }

  if (vacating.status === 'rejected') {
    const reason = vacating.notes?.trim();
    return {
      headline: 'Request rejected by management.',
      detail: reason
        ? `Reason: ${reason}. Submit a new request with an updated vacate date.`
        : 'Submit a new move-out request with an updated vacate date.',
    };
  }

  if (vacating.status === 'approved') {
    const today = todayString();
    if (checkoutStatus === 'awaiting_admin_review') {
      return {
        headline: 'Waiting for PG verification',
        detail: RESIDENT_WAITING_PG_VERIFICATION,
      };
    }
    if (checkoutStatus === 'refund_pending') {
      return {
        headline: 'Settlement under review',
        detail: 'We are finalising your refund. No action needed from you right now.',
      };
    }
    if (today < vacating.vacatingDate) {
      return {
        headline: 'Vacate approved',
        detail: RESIDENT_WAITING_METER_UPI_ON_VACATE_DATE,
      };
    }
    if (checkoutStatus === 'awaiting_resident_details') {
      if (zeroRefundDue) {
        return {
          headline: 'Submit checkout details',
          detail:
            'Upload your final AC meter photo so admin can complete your zero-refund checkout.',
        };
      }
      return {
        headline: 'Request your refund',
        detail: RESIDENT_WAITING_METER_UPI_ON_VACATE_DATE,
      };
    }
    return {
      headline: 'Vacate approved',
      detail: RESIDENT_WAITING_METER_UPI_ON_VACATE_DATE,
    };
  }

  if (vacating.status === 'completed' || checkoutStatus === 'refund_paid') {
    return {
      headline: 'Move-out complete',
      detail: RESIDENT_MOVE_OUT_COMPLETED,
    };
  }

  return {
    headline: 'Move-out in progress',
    detail: 'We will update you at each step until your refund is sent.',
  };
}

export type SettlementLine = {
  label: string;
  amountPaise: number;
  tone?: 'deduction' | 'credit' | 'neutral';
};

export function buildVacatingSettlementLines(
  vacating: VacatingForBookingRow | null,
): SettlementLine[] {
  if (!vacating || vacating.status !== 'completed') return [];
  const lines: SettlementLine[] = [];
  if (vacating.deductionPaise > 0) {
    lines.push({
      label: vacating.noticeCompliant ? 'Deductions' : 'Short-notice deduction',
      amountPaise: vacating.deductionPaise,
      tone: 'deduction',
    });
  }
  if (vacating.depositRefundPaise > 0) {
    lines.push({
      label: 'Deposit refund',
      amountPaise: vacating.depositRefundPaise,
      tone: 'credit',
    });
  }
  return lines;
}
