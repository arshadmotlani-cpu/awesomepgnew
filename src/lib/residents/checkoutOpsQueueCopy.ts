import type { CheckoutSettlementStatus } from '@/src/db/schema/enums';

export function deriveCheckoutOpsNextAction(input: {
  vacatingStatus: 'pending' | 'approved' | string;
  settlementStatus: CheckoutSettlementStatus | null;
  finalRefundPaise: number | null;
}): { nextAction: string; primaryActionLabel: string; issue: string } {
  const { vacatingStatus, settlementStatus, finalRefundPaise } = input;
  const refundPaise = finalRefundPaise ?? 0;

  if (vacatingStatus === 'pending') {
    return {
      issue: 'Move-out notice awaiting approval',
      nextAction: 'Approve move-out notice before checkout can start',
      primaryActionLabel: 'Approve move-out',
    };
  }

  if (settlementStatus === 'awaiting_resident_details') {
    return {
      issue: 'Checkout started — waiting on resident',
      nextAction: 'Waiting for resident meter photo and UPI refund details',
      primaryActionLabel: 'Open checkout',
    };
  }

  if (settlementStatus === 'awaiting_admin_review') {
    return {
      issue: 'Resident submitted checkout details',
      nextAction: 'Review electricity and deductions, then approve settlement',
      primaryActionLabel: 'Review settlement',
    };
  }

  if (settlementStatus === 'refund_pending' && refundPaise > 0) {
    return {
      issue: 'Settlement approved — refund due',
      nextAction: `Send ₹${(refundPaise / 100).toFixed(0)} refund to resident, then mark paid`,
      primaryActionLabel: 'Mark refund paid',
    };
  }

  if (
    settlementStatus === 'refund_pending' &&
    refundPaise <= 0
  ) {
    return {
      issue: 'Refund queue stale — no amount due',
      nextAction: 'Complete checkout — deposit fully consumed (₹0 refund)',
      primaryActionLabel: 'Complete checkout',
    };
  }

  if (
    (settlementStatus === 'approved' || !settlementStatus) &&
    refundPaise <= 0
  ) {
    return {
      issue: 'Move-out approved — zero-refund checkout',
      nextAction: 'Complete checkout — deposit fully consumed (₹0 refund)',
      primaryActionLabel: 'Complete checkout',
    };
  }

  if (settlementStatus === 'approved' && refundPaise > 0) {
    return {
      issue: 'Settlement approved — release refund',
      nextAction: 'Mark refund as paid after UPI transfer',
      primaryActionLabel: 'Mark refund paid',
    };
  }

  if (!settlementStatus) {
    return {
      issue: 'Move-out approved — checkout not created',
      nextAction: 'Open checkout settlements — sync or create settlement record',
      primaryActionLabel: 'Open checkout',
    };
  }

  return {
    issue: 'Move-out approved · checkout in progress',
    nextAction: `Checkout status: ${settlementStatus.replace(/_/g, ' ')}`,
    primaryActionLabel: 'Open checkout',
  };
}

export function isTerminalCheckoutSettlement(
  status: CheckoutSettlementStatus | null | undefined,
): boolean {
  return status === 'completed' || status === 'refund_paid';
}

/** ₹0 refund still marked refund_pending — stale pipeline row, not real work. */
export function isStaleZeroRefundSettlement(input: {
  status: CheckoutSettlementStatus | string | null | undefined;
  finalRefundPaise?: number | null;
}): boolean {
  return input.status === 'refund_pending' && (input.finalRefundPaise ?? 0) <= 0;
}
