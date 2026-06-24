import type { ResidentFinancialSummary } from '@/src/lib/billing/residentFinancialTypes';
import { paiseToInr } from '@/src/lib/format';
import {
  buildKycReviewAction,
  isKycReviewRequired,
  type ResidentUnresolvedAction,
} from '@/src/lib/residents/residentUnresolvedActions';

export type Resident360Workflow = {
  stateLine: string;
  nextAction: string;
  primaryAction: {
    label: string;
    href: string;
  } | null;
};

export function buildResident360Workflow(input: {
  customerId: string;
  customerName: string;
  kycStatus: 'pending' | 'approved' | 'rejected';
  pendingKycSubmissionId: string | null;
  hasActiveTenancy: boolean;
  hasBed: boolean;
  bookingId: string | null;
  financialSummary: ResidentFinancialSummary | null;
  residencyStatus: string;
  primaryUnresolved?: ResidentUnresolvedAction | null;
}): Resident360Workflow {
  const { financialSummary } = input;

  if (input.primaryUnresolved) {
    const action = input.primaryUnresolved;
    return {
      stateLine: action.stateLine ?? `${input.customerName} — action required`,
      nextAction: action.nextAction ?? 'Complete the admin step below.',
      primaryAction: { label: action.label, href: action.href },
    };
  }

  if (input.residencyStatus === 'vacated') {
    return {
      stateLine: `${input.customerName} — moved out`,
      nextAction: 'Review final settlement and deposit refund if pending.',
      primaryAction: input.bookingId
        ? { label: 'Open deposit settlement', href: `/admin/deposits/${input.bookingId}` }
        : null,
    };
  }

  if (isKycReviewRequired({ pendingKycSubmissionId: input.pendingKycSubmissionId })) {
    const kyc = buildKycReviewAction({
      customerId: input.customerId,
      customerName: input.customerName,
      pendingKycSubmissionId: input.pendingKycSubmissionId!,
    });
    return {
      stateLine: kyc.stateLine!,
      nextAction: kyc.nextAction!,
      primaryAction: { label: kyc.label, href: kyc.href },
    };
  }

  if (!input.hasBed && input.kycStatus === 'approved') {
    return {
      stateLine: `${input.customerName} — verified, no bed assigned`,
      nextAction: 'Assign an open bed to complete move-in.',
      primaryAction: {
        label: 'Assign bed',
        href: `/admin/beds?customerId=${input.customerId}`,
      },
    };
  }

  const rentOutstanding = financialSummary?.rent.outstandingPaise ?? 0;
  const depositOutstanding = financialSummary?.deposit.outstandingPaise ?? 0;
  const elecOutstanding = financialSummary?.electricity.outstandingPaise ?? 0;
  const totalOutstanding = financialSummary?.totals.outstandingPaise ?? 0;

  const overdueRent = financialSummary?.rent.items.find(
    (i) => i.outstandingPaise > 0 && i.status === 'overdue',
  );
  const overdueElec = financialSummary?.electricity.items.find(
    (i) => i.outstandingPaise > 0 && i.status === 'overdue',
  );

  if (overdueRent && rentOutstanding > 0) {
    return {
      stateLine: `${input.customerName} — rent overdue ${paiseToInr(rentOutstanding)}`,
      nextAction: 'Send payment request or record cash received.',
      primaryAction: { label: 'Collect rent', href: '#open-bills' },
    };
  }

  if (depositOutstanding > 0 && input.bookingId) {
    return {
      stateLine: `${input.customerName} — deposit due ${paiseToInr(depositOutstanding)}`,
      nextAction: 'Collect security deposit or record partial payment.',
      primaryAction: {
        label: 'Open deposit',
        href: `/admin/deposits/${input.bookingId}`,
      },
    };
  }

  if (overdueElec && elecOutstanding > 0) {
    return {
      stateLine: `${input.customerName} — electricity overdue ${paiseToInr(elecOutstanding)}`,
      nextAction: 'Send payment link or record payment.',
      primaryAction: { label: 'Collect electricity', href: '#open-bills' },
    };
  }

  if (totalOutstanding > 0) {
    return {
      stateLine: `${input.customerName} — ${paiseToInr(totalOutstanding)} outstanding`,
      nextAction: 'Collect the highest-priority open bill below.',
      primaryAction: { label: 'View open bills', href: '#open-bills' },
    };
  }

  if (input.hasActiveTenancy) {
    return {
      stateLine: `${input.customerName} — active resident, no dues`,
      nextAction: 'No collection action needed. Use profile tools for bed or rent changes.',
      primaryAction: null,
    };
  }

  return {
    stateLine: `${input.customerName} — onboarding in progress`,
    nextAction: 'Complete verification and bed assignment.',
    primaryAction: {
      label: 'Assign bed',
      href: `/admin/beds?customerId=${input.customerId}`,
    },
  };
}
