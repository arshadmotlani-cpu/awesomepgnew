/**
 * Business vs accounting display copy for post-checkout payouts.
 * Product SSOT: docs/SYSTEM/CHECKOUT_SETTLEMENT_STATE_MACHINE.md § Terminology Rules.
 * Internal IDs remain refund_due / refund_pending — do not rename without versioned migration.
 */

/** Operations filter chip (id stays `refund_due`). */
export const OPS_PENDING_PAYOUTS_LABEL = 'Pending payouts';

export const PAYOUT_PENDING_STATUS = 'Payout pending';

export const RECORD_PAYOUT_CTA = 'Record payout';

export const CHECKOUT_COMPLETE_PAYOUT_PENDING_REASON = 'Checkout complete · payout pending';

export const DEPOSIT_PAYOUT_PENDING_REASON = 'Deposit payout pending';

/** Resident portal / notifications */
export const RESIDENT_PAYOUT_PROCESSING = 'Your payout is being processed.';

export const RESIDENT_PAYOUT_COMPLETED = 'Your payout has been completed.';

export const RESIDENT_PAYOUT_COMPLETED_ON_DATE = (formattedDate: string) =>
  `Payment completed on ${formattedDate}.`;

export const PAYOUT_COMPLETED_LABEL = 'Payout completed';

export const RESIDENT_PAYOUT_PROCESSING_CHIP = 'Payout processing';

export const RESIDENT_PAYOUT_SENT_CHIP = 'Payout completed';

/** Admin action item / notification titles */
export function adminPayoutPendingTitle(residentName: string): string {
  return `${residentName} · Payout pending`;
}

export const REFUND_CONSOLE_PAYOUT_SUBTITLE =
  'Record resident payout after checkout is finalized.';
