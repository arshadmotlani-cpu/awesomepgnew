/**
 * Refundable-now SSOT — unused prepaid rent + deposit excess (categories stay distinct).
 */

import type { DepositRefundCeiling } from '@/src/lib/deposits/depositRefundCeiling';
import { getDepositRefundCeilingForBooking } from '@/src/lib/deposits/depositRefundCeiling';
import type { PrepaidRentRefundCeiling } from '@/src/lib/billing/prepaidRentRefundCeiling';
import {
  getPrepaidRentRefundCeilingForBooking,
} from '@/src/lib/billing/prepaidRentRefundCeiling';
import { guardDepositPaise } from '@/src/lib/deposits/paiseSafety';

export type ResidentRefundableNow = {
  prepaidRent: PrepaidRentRefundCeiling;
  deposit: DepositRefundCeiling | null;
  prepaidRentRefundableNowPaise: number;
  depositRefundableNowPaise: number;
  totalRefundableNowPaise: number;
  requiredDepositLockedPaise: number;
};

/**
 * Combined refund allocation waterfall: unused prepaid rent first, then deposit excess.
 * Documented policy — do not collapse categories in accounting.
 */
export function allocateCombinedRefundRequestPaise(
  requestedTotalPaise: number,
  input: {
    prepaidAvailablePaise: number;
    depositAvailablePaise: number;
  },
): { prepaidRentPaise: number; depositPaise: number } {
  const total = guardDepositPaise(requestedTotalPaise, 'allocate.total');
  const prepaidCap = Math.max(0, input.prepaidAvailablePaise);
  const depositCap = Math.max(0, input.depositAvailablePaise);
  const prepaidRentPaise = Math.min(total, prepaidCap);
  const depositPaise = Math.min(total - prepaidRentPaise, depositCap);
  return { prepaidRentPaise, depositPaise };
}

export async function getResidentRefundableNowForBooking(input: {
  customerId: string;
  bookingId: string;
}): Promise<ResidentRefundableNow | null> {
  const [prepaidRent, deposit] = await Promise.all([
    getPrepaidRentRefundCeilingForBooking(input),
    getDepositRefundCeilingForBooking(input.bookingId),
  ]);

  const prepaidRentRefundableNowPaise = prepaidRent.availableToRequestPaise;
  const depositRefundableNowPaise = deposit?.availableToRequestPaise ?? 0;

  return {
    prepaidRent,
    deposit,
    prepaidRentRefundableNowPaise,
    depositRefundableNowPaise,
    totalRefundableNowPaise: prepaidRentRefundableNowPaise + depositRefundableNowPaise,
    requiredDepositLockedPaise: deposit?.requiredPaise ?? 0,
  };
}

export function assertCombinedRefundRequestAmountPaise(
  requestedTotalPaise: number,
  refundable: ResidentRefundableNow,
): { ok: true; allocation: { prepaidRentPaise: number; depositPaise: number } } | { ok: false; error: string } {
  const total = guardDepositPaise(requestedTotalPaise, 'combined.request');
  if (total <= 0) {
    return { ok: false, error: 'Refund amount must be greater than zero.' };
  }
  if (total > refundable.totalRefundableNowPaise) {
    return {
      ok: false,
      error: 'Requested amount exceeds your available refundable balance.',
    };
  }
  const allocation = allocateCombinedRefundRequestPaise(total, {
    prepaidAvailablePaise: refundable.prepaidRentRefundableNowPaise,
    depositAvailablePaise: refundable.depositRefundableNowPaise,
  });
  const allocatedTotal = allocation.prepaidRentPaise + allocation.depositPaise;
  if (allocatedTotal !== total) {
    return { ok: false, error: 'Requested amount exceeds your available refundable balance.' };
  }
  return { ok: true, allocation };
}

/** Mid-stay deposit excess may be requested without vacating unlock when ceiling allows. */
export function canRequestDepositExcessRefundMidStay(
  depositCeiling: DepositRefundCeiling | null,
): boolean {
  return (depositCeiling?.availableToRequestPaise ?? 0) > 0;
}
