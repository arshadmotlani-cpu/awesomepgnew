import type { VacatingForBookingRow } from '@/src/db/queries/customer';

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
    label: 'Give move-out notice',
    residentHint: 'Tell us when you plan to leave.',
  },
  {
    id: 'notice',
    label: 'Notice review',
    residentHint: 'We check your notice period meets policy.',
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
): number {
  if (checkoutStatus === 'completed' || checkoutStatus === 'archived') return 6;
  if (checkoutStatus === 'refund_paid') return 5;
  if (checkoutStatus === 'refund_pending' || checkoutStatus === 'awaiting_admin_review') return 4;
  if (checkoutStatus === 'awaiting_resident_details') return 3;
  if (vacatingStatus === 'approved') return 2;
  if (vacatingStatus === 'pending') return 1;
  if (vacatingStatus === 'completed') return 6;
  return 0;
}

export function vacatingStatusLabel(status: VacatingForBookingRow['status'] | null): string {
  switch (status) {
    case 'pending':
      return 'Waiting for review';
    case 'approved':
      return 'Notice approved';
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
}): { headline: string; detail: string } {
  const { vacating, checkoutStatus } = args;

  if (!vacating) {
    return {
      headline: 'Plan your move-out',
      detail: 'Submit a move-out notice at least 14 days before you leave to avoid a deposit deduction.',
    };
  }

  if (vacating.status === 'pending') {
    return {
      headline: 'We received your notice',
      detail: 'Our team is reviewing your move-out date. You can withdraw the request until it is approved.',
    };
  }

  if (vacating.status === 'rejected') {
    return {
      headline: 'Notice was not approved',
      detail: 'Contact support if you need to change your move-out date or resubmit.',
    };
  }

  if (vacating.status === 'approved') {
    if (checkoutStatus === 'awaiting_resident_details') {
      return {
        headline: 'Confirm refund details',
        detail: 'Share your bank or UPI details so we can send your deposit refund.',
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
      headline: 'Notice approved',
      detail: 'We will settle electricity and your deposit before your move-out date.',
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
  if (!vacating) return [];
  const lines: SettlementLine[] = [];
  if (vacating.deductionPaise > 0) {
    lines.push({
      label: vacating.noticeCompliant ? 'Other deductions' : 'Short-notice deduction (5 days rent)',
      amountPaise: vacating.deductionPaise,
      tone: 'deduction',
    });
  }
  if (vacating.status === 'completed' && vacating.depositRefundPaise > 0) {
    lines.push({
      label: 'Deposit refund',
      amountPaise: vacating.depositRefundPaise,
      tone: 'credit',
    });
  }
  return lines;
}
