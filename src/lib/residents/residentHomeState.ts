import { formatDate, paiseToInr } from '@/src/lib/format';
import { accountProfileHref, residentTabHref } from '@/src/lib/accountNavigation';
import type { UpcomingPaymentRow } from '@/src/components/customer/account/resident/ResidentUpcomingPayments';

export type ResidentHomePhase =
  | 'identity'
  | 'move_out'
  | 'payment_due'
  | 'requests'
  | 'caught_up';

export type ResidentHomeStatus = {
  phase: ResidentHomePhase;
  headline: string;
  subline: string;
  chipLabel: string;
  chipStatus: string;
};

export type ResidentHomePrimaryAction = {
  href: string;
  label: string;
};

export function deriveResidentHomeStatus(input: {
  kycStatus: string;
  documentsSubmitted: boolean;
  hasMoveOutInProgress: boolean;
  vacatingStatus: string | null;
  checkoutStatus: string | null;
  totalDuePaise: number;
  openRequestCount: number;
  pgName: string;
  roomNumber: string;
  bedCode: string;
  nextBillStatus?: string | null;
}): ResidentHomeStatus {
  const stay = `${input.pgName} · Room ${input.roomNumber} · Bed ${input.bedCode}`;

  if (input.kycStatus !== 'approved') {
    return {
      phase: 'identity',
      headline: input.documentsSubmitted ? 'We are checking your documents' : 'Finish your identity check',
      subline: input.documentsSubmitted
        ? 'Usually takes 1–2 working days. We will notify you when done.'
        : 'Upload Aadhaar and a selfie before you move in.',
      chipLabel: input.documentsSubmitted ? 'Under review' : 'Action needed',
      chipStatus: input.documentsSubmitted ? 'under_review' : 'pending',
    };
  }

  if (input.hasMoveOutInProgress) {
    const step = moveOutStepLabel(input.vacatingStatus, input.checkoutStatus);
    return {
      phase: 'move_out',
      headline: 'Your move-out is in progress',
      subline: step,
      chipLabel: 'Move-out',
      chipStatus: input.checkoutStatus ?? input.vacatingStatus ?? 'pending',
    };
  }

  if (input.totalDuePaise > 0) {
    const billTone = (input.nextBillStatus ?? '').toLowerCase();
    return {
      phase: 'payment_due',
      headline: 'You have bills due',
      subline: stay,
      chipLabel: billTone.includes('overdue') ? 'Overdue' : 'Bill due',
      chipStatus: billTone.includes('overdue') ? 'overdue' : 'pending',
    };
  }

  if (input.openRequestCount > 0) {
    return {
      phase: 'requests',
      headline: `${input.openRequestCount} request${input.openRequestCount === 1 ? '' : 's'} in progress`,
      subline: stay,
      chipLabel: 'Request open',
      chipStatus: 'submitted',
    };
  }

  return {
    phase: 'caught_up',
    headline: 'You are all caught up',
    subline: stay,
    chipLabel: 'All good',
    chipStatus: 'approved',
  };
}

function moveOutStepLabel(
  vacatingStatus: string | null,
  checkoutStatus: string | null,
): string {
  if (checkoutStatus === 'refund_paid') return 'Your refund has been sent.';
  if (checkoutStatus === 'refund_pending' || checkoutStatus === 'awaiting_admin_review') {
    return 'We are reviewing your refund.';
  }
  if (checkoutStatus === 'awaiting_resident_details') {
    return 'We need your UPI or bank details for the refund.';
  }
  if (vacatingStatus === 'approved') return 'We are settling your final bills.';
  if (vacatingStatus === 'pending') return 'Waiting for the office to approve your notice.';
  return 'Track each step on the Move-out page.';
}

export function deriveResidentHomePrimaryAction(input: {
  kycStatus: string;
  documentsSubmitted: boolean;
  totalDuePaise: number;
  depositDuePaise: number;
  depositPaymentLinkUrl: string | null;
  firstUnpaidRentId: string | null;
  firstUnpaidElectricityId: string | null;
  firstPayment: UpcomingPaymentRow | null;
  hasMoveOutInProgress: boolean;
  openRequestCount: number;
}): ResidentHomePrimaryAction {
  if (input.kycStatus !== 'approved') {
    return {
      href: accountProfileHref('identity'),
      label: input.documentsSubmitted ? 'Check identity status' : 'Upload documents',
    };
  }

  if (input.hasMoveOutInProgress) {
    return {
      href: residentTabHref('vacating'),
      label: 'Continue move-out',
    };
  }

  if (input.totalDuePaise > 0) {
    if (input.depositDuePaise > 0 && input.depositPaymentLinkUrl) {
      return {
        href: input.depositPaymentLinkUrl,
        label: `Pay security deposit · ${paiseToInr(input.depositDuePaise)}`,
      };
    }
    if (input.firstPayment?.href) {
      return {
        href: input.firstPayment.href,
        label: `Pay ${paiseToInr(input.firstPayment.amountPaise)} now`,
      };
    }
    if (input.firstUnpaidRentId) {
      return {
        href: `/account/resident/pay-rent/${input.firstUnpaidRentId}`,
        label: `Pay ${paiseToInr(input.totalDuePaise)} now`,
      };
    }
    if (input.firstUnpaidElectricityId) {
      return {
        href: `/account/resident/pay-electricity/${input.firstUnpaidElectricityId}`,
        label: 'Pay electricity bill',
      };
    }
    return {
      href: residentTabHref('payments'),
      label: `Pay ${paiseToInr(input.totalDuePaise)} now`,
    };
  }

  if (input.openRequestCount > 0) {
    return {
      href: residentTabHref('requests'),
      label: 'View your requests',
    };
  }

  return {
    href: residentTabHref('payments'),
    label: 'View your bills',
  };
}

export function deriveWhatHappensNext(input: {
  phase: ResidentHomePhase;
  documentsSubmitted: boolean;
  firstPayment: UpcomingPaymentRow | null;
  openRequestCount: number;
}): string {
  switch (input.phase) {
    case 'identity':
      return input.documentsSubmitted
        ? 'After approval, your resident home unlocks fully and you can pay bills here.'
        : 'Once uploaded, our team reviews your documents. You will see status update here.';
    case 'move_out':
      return 'We will guide you through final bills and your deposit refund step by step.';
    case 'payment_due':
      return input.firstPayment?.dueDate
        ? `Pay before ${formatDate(input.firstPayment.dueDate)} to avoid late fees. After payment, status updates within a few minutes.`
        : 'After you pay, we confirm receipt and your bill status updates here.';
    case 'requests':
      return `You have ${input.openRequestCount} open request${input.openRequestCount === 1 ? '' : 's'}. We will notify you when something changes.`;
    case 'caught_up':
      return 'New rent bills appear here on the 1st of each month. We will show the next one when it is ready.';
  }
}

export function requestTypeLabel(type: string): string {
  switch (type) {
    case 'deposit_refund':
      return 'Deposit refund';
    case 'stay_extension':
      return 'Stay extension';
    case 'deposit_due_extension':
      return 'More time for deposit';
    case 'vacating':
      return 'Move-out';
    default:
      return 'Request';
  }
}

export function deriveAdminWaitingMessage(input: {
  kycStatus: string;
  documentsSubmitted: boolean;
  vacatingStatus: string | null;
  checkoutStatus: string | null;
  openRequests: Array<{ status: string }>;
}): string | null {
  if (input.kycStatus !== 'approved' && input.documentsSubmitted) {
    return 'Our team is reviewing your identity documents — usually 1–2 working days.';
  }
  if (input.vacatingStatus === 'pending') {
    return 'Waiting for the office to approve your move-out date.';
  }
  if (
    input.checkoutStatus === 'awaiting_admin_review' ||
    input.checkoutStatus === 'refund_pending'
  ) {
    return 'We are reviewing your checkout and deposit refund.';
  }
  const pendingRequest = input.openRequests.find(
    (r) => r.status === 'pending' || r.status === 'submitted',
  );
  if (pendingRequest) {
    return 'You have a request waiting on the office. We will notify you when it updates.';
  }
  return null;
}
