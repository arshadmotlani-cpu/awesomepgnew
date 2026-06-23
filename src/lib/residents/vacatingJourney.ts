import type { VacatingForBookingRow } from '@/src/db/queries/customer';
import { todayString } from '@/src/lib/dates';
import { fixedStayRefundUnlockLabel, isPastFixedStayCheckout } from '@/src/lib/dates/ist';
import { formatDate } from '@/src/lib/format';

export type VacatingStageId =
  | 'request'
  | 'notice'
  | 'electricity'
  | 'deposit'
  | 'refund_review'
  | 'refund_paid'
  | 'completed';

export type VacatingStage = {
  id: VacatingStageId;
  label: string;
  residentHint: string;
};

export const VACATING_JOURNEY_STAGES: VacatingStage[] = [
  {
    id: 'request',
    label: 'Request vacate',
    residentHint: 'Choose your vacate date and upload required photos.',
  },
  {
    id: 'notice',
    label: 'Admin review',
    residentHint: 'Waiting for admin approval of your vacate request.',
  },
  {
    id: 'electricity',
    label: 'Electricity settled',
    residentHint: 'Final room electricity bill is cleared.',
  },
  {
    id: 'deposit',
    label: 'Deposit review',
    residentHint: 'We confirm your deposit balance and any deductions.',
  },
  {
    id: 'refund_review',
    label: 'Refund approved',
    residentHint: 'Your refund amount is confirmed.',
  },
  {
    id: 'refund_paid',
    label: 'Refund sent',
    residentHint: 'Money is on its way to your account.',
  },
  {
    id: 'completed',
    label: 'Move-out complete',
    residentHint: 'Your stay is closed and refund is done.',
  },
];

export function vacatingStageIndex(
  vacatingStatus: string | null,
  checkoutStatus: string | null,
  vacatingDate?: string | null,
  today?: string,
): number {
  const todayStr = today ?? todayString();

  if (checkoutStatus === 'completed' || checkoutStatus === 'archived') return 6;
  if (checkoutStatus === 'refund_paid') return 5;
  if (checkoutStatus === 'refund_pending' || checkoutStatus === 'awaiting_admin_review') return 4;

  if (vacatingStatus === 'approved' && vacatingDate && todayStr < vacatingDate) {
    return 2;
  }

  if (checkoutStatus === 'awaiting_resident_details') return 3;
  if (vacatingStatus === 'approved') return 2;
  if (vacatingStatus === 'pending') return 1;
  if (vacatingStatus === 'completed') return 6;
  return 0;
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
}): { headline: string; detail: string } {
  const { vacating, checkoutStatus, durationMode, expectedCheckoutDate } = args;
  const fixedStay = durationMode && ['fixed_stay', 'daily', 'weekly'].includes(durationMode);

  if (fixedStay && expectedCheckoutDate) {
    if (checkoutStatus === 'awaiting_resident_details') {
      return {
        headline: 'Request deposit refund',
        detail:
          'Your stay checkout is complete. Submit your final electricity meter photo and UPI details for deposit refund.',
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
        headline: 'Refund in progress',
        detail: 'We are finalising your deposit refund. No action needed from you right now.',
      };
    }
    if (checkoutStatus === 'refund_paid' || checkoutStatus === 'completed') {
      return {
        headline: 'Refund complete',
        detail: 'Your stay is closed. Check your payment history for the refund receipt.',
      };
    }
  }

  if (!vacating) {
    return {
      headline: 'Request vacate',
      detail: 'Submit your vacate date with room and electricity meter photos. Admin approves before settlement.',
    };
  }

  if (vacating.status === 'pending') {
    return {
      headline: 'Vacate request submitted',
      detail: 'Pending admin approval. Refund and final charges are calculated only after the office reviews your request.',
    };
  }

  if (vacating.status === 'rejected') {
    return {
      headline: 'Notice was not approved',
      detail: 'Contact support if you need to change your move-out date or resubmit.',
    };
  }

  if (vacating.status === 'approved') {
    const today = todayString();
    if (today < vacating.vacatingDate) {
      return {
        headline: 'Vacate approved',
        detail: `Your move-out on ${formatDate(vacating.vacatingDate)} is confirmed. Deposit refund and meter photo unlock on that date.`,
      };
    }
    if (checkoutStatus === 'awaiting_resident_details') {
      return {
        headline: 'Vacate approved',
        detail: 'Submit your final electricity meter photo and UPI details for deposit refund.',
      };
    }
    if (
      checkoutStatus === 'awaiting_admin_review' ||
      checkoutStatus === 'refund_pending'
    ) {
      return {
        headline: 'Refund in progress',
        detail: 'We are finalising your deposit refund. No action needed from you right now.',
      };
    }
    return {
      headline: 'Vacate approved',
      detail: 'Deposit refund unlocks on your vacate date. Final settlement happens after move-out.',
    };
  }

  if (vacating.status === 'completed' || checkoutStatus === 'refund_paid') {
    return {
      headline: 'Refund complete',
      detail: 'Your move-out is finished. Check your payment history for the refund receipt.',
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
