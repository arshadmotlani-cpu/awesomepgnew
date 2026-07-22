/**
 * Client-safe payment allocation UX — admin must fully allocate before approve.
 * Uses ONLY the single proof under review — never lifetime booking balances.
 */

import type { PaymentAllocationInput } from '@/src/lib/billing/bookingMoneyBalances';
import {
  suggestPaymentAllocation,
  totalAllocatedPaise,
  unallocatedPaymentPaise,
} from '@/src/lib/billing/bookingMoneyBalances';
import { buildPaymentReviewBreakdown } from '@/src/lib/operations/paymentReviewBreakdown';
import { proofAmountPaiseFromReviewItem } from '@/src/lib/operations/paymentReviewProofAmount';
import type { PendingPaymentReviewItem } from '@/src/lib/operations/paymentReviewTypes';

export function residentPaidPaiseFromReviewItem(item: PendingPaymentReviewItem): number {
  return proofAmountPaiseFromReviewItem(item);
}

export function buildAllocationDefaultsFromReviewItem(
  item: PendingPaymentReviewItem,
): PaymentAllocationInput {
  const confirmedReceivedPaise = proofAmountPaiseFromReviewItem(item);
  const breakdown = buildPaymentReviewBreakdown(item);
  const base = {
    confirmedReceivedPaise,
    rentAllocatedPaise: 0,
    depositAllocatedPaise: 0,
    electricityAllocatedPaise: 0,
    otherAllocatedPaise: 0,
  };

  if (item.kind === 'qr' && item.bookingPaymentReview) {
    const review = item.bookingPaymentReview;
    const rentAllocatedPaise = Math.min(confirmedReceivedPaise, review.rentPaisePaid);
    const depositAllocatedPaise = Math.min(
      Math.max(0, confirmedReceivedPaise - rentAllocatedPaise),
      review.depositPaisePaid,
    );
    const otherAllocatedPaise = Math.max(
      0,
      confirmedReceivedPaise - rentAllocatedPaise - depositAllocatedPaise,
    );
    return {
      confirmedReceivedPaise,
      rentAllocatedPaise,
      depositAllocatedPaise,
      electricityAllocatedPaise: 0,
      otherAllocatedPaise,
    };
  }

  switch (item.kind) {
    case 'rent':
    case 'extension':
      return { ...base, rentAllocatedPaise: confirmedReceivedPaise };
    case 'electricity':
      return { ...base, electricityAllocatedPaise: confirmedReceivedPaise };
    case 'deposit_link':
      return { ...base, depositAllocatedPaise: confirmedReceivedPaise };
    case 'qr':
      return suggestPaymentAllocation({
        confirmedReceivedPaise,
        rentOutstandingPaise: breakdown.roomChargesDuePaise,
        depositOutstandingPaise: breakdown.securityDepositDuePaise,
        electricityOutstandingPaise: 0,
      });
    default:
      return base;
  }
}

export function allocationIsFullyAllocated(allocation: PaymentAllocationInput): boolean {
  return unallocatedPaymentPaise(allocation) === 0 && totalAllocatedPaise(allocation) > 0;
}

export function allocationSummaryLines(
  allocation: PaymentAllocationInput,
): Array<{ label: string; amountPaise: number }> {
  const lines: Array<{ label: string; amountPaise: number }> = [];
  if (allocation.rentAllocatedPaise > 0) {
    lines.push({ label: 'Rent', amountPaise: allocation.rentAllocatedPaise });
  }
  if (allocation.depositAllocatedPaise > 0) {
    lines.push({ label: 'Deposit', amountPaise: allocation.depositAllocatedPaise });
  }
  if (allocation.electricityAllocatedPaise > 0) {
    lines.push({ label: 'Electricity', amountPaise: allocation.electricityAllocatedPaise });
  }
  if (allocation.otherAllocatedPaise > 0) {
    lines.push({ label: 'Other', amountPaise: allocation.otherAllocatedPaise });
  }
  return lines;
}

/** @deprecated Always show editable allocation — kept for tests migrating off progressive disclosure. */
export function needsManualPaymentAllocation(input: {
  submittedAmountPaise: number;
  confirmedReceivedPaise: number;
  adminAdjustOpen?: boolean;
}): boolean {
  void input;
  return true;
}
