/**
 * Resident wallet presentation for resident_credit_ledger (separate from deposit escrow).
 */

import { ROOM_CHANGE_CREDIT_REASON_PREFIX } from '@/src/services/roomTransferBilling';

export type ResidentCreditWalletLine = {
  balancePaise: number;
  /** Human-readable policy for the resident portal. */
  statusLabel: string;
  sourceLabel: string;
  /** Credit auto-applies to upcoming rent invoices while the stay is active. */
  spendableOnFutureRent: boolean;
  /** Included in checkout / vacating settlement waterfall (not mid-stay deposit refund). */
  includedInCheckoutSettlement: boolean;
  /** Mid-stay deposit-refund request must not consume this balance. */
  separateFromDepositRefund: true;
  /** Unused prepaid rent eligible for mid-stay refund request (when > 0). */
  refundableNowPaise?: number;
};

export function classifyResidentCreditReason(reason: string): {
  kind: 'room_change_unused_rent' | 'move_out_unused_rent' | 'advance_rent' | 'other';
  sourceLabel: string;
} {
  if (reason.startsWith(ROOM_CHANGE_CREDIT_REASON_PREFIX)) {
    return {
      kind: 'room_change_unused_rent',
      sourceLabel: 'Unused prepaid rent from room change',
    };
  }
  if (reason.startsWith('move_out_unused_rent:')) {
    return {
      kind: 'move_out_unused_rent',
      sourceLabel: 'Unused prepaid rent from move-out',
    };
  }
  if (reason.startsWith('advance_rent')) {
    return { kind: 'advance_rent', sourceLabel: 'Advance rent credit' };
  }
  return { kind: 'other', sourceLabel: 'Account credit' };
}

export function buildResidentCreditWalletLine(input: {
  balancePaise: number;
  primaryReason?: string | null;
  hasOpenVacating: boolean;
  refundableNowPaise?: number;
}): ResidentCreditWalletLine | null {
  if (input.balancePaise <= 0 && (input.refundableNowPaise ?? 0) <= 0) return null;
  const classified = input.primaryReason
    ? classifyResidentCreditReason(input.primaryReason)
    : { kind: 'other' as const, sourceLabel: 'Account credit' };

  const spendableOnFutureRent = true;
  const includedInCheckoutSettlement = true;

  let statusLabel =
    'Available — applies automatically to your next rent bills until used.';
  if (classified.kind === 'room_change_unused_rent') {
    const refundableNow = input.refundableNowPaise ?? 0;
    if (refundableNow > 0 && !input.hasOpenVacating) {
      statusLabel =
        'Unused prepaid rent — refundable now via Request money, or applies to upcoming rent until used.';
    } else if (input.hasOpenVacating) {
      statusLabel = 'Included in your checkout settlement estimate when you move out.';
    } else {
      statusLabel =
        'Applies to upcoming rent automatically; also part of checkout settlement when you vacate.';
    }
  }

  return {
    balancePaise: input.balancePaise,
    statusLabel,
    sourceLabel: classified.sourceLabel,
    spendableOnFutureRent,
    includedInCheckoutSettlement,
    separateFromDepositRefund: true,
    refundableNowPaise: input.refundableNowPaise,
  };
}

/**
 * Mid-stay estimate: refundable deposit excess minus known electricity due.
 * Does NOT include resident_credit_ledger balance (separate category).
 */
export function computeDepositCheckoutEstimatePaise(input: {
  depositRefundableExcessPaise: number;
  electricityOutstandingPaise: number;
}): number {
  return Math.max(
    0,
    input.depositRefundableExcessPaise - Math.max(0, input.electricityOutstandingPaise),
  );
}
