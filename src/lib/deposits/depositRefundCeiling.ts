/**
 * Resident deposit refund request ceiling — held vs required vs refundable excess.
 * deposit_ledger net balance is HELD; only amount above current required deposit is refundable mid-stay.
 */

import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { bookings, residentRequests } from '@/src/db/schema';
import type { PricingSnapshot } from '@/src/db/schema/bookings';
import { resolveBookingDepositCreditAppliedPaise } from '@/src/lib/billing/bookingCheckoutTotals';
import { guardDepositPaise } from '@/src/lib/deposits/paiseSafety';
import { paiseToInr } from '@/src/lib/format';
import { getDepositSummaryForBooking } from '@/src/services/deposits';

export type DepositRefundCeiling = {
  /** Verified security deposit held (deposit_ledger net, paise). */
  heldPaise: number;
  /** Current effective required security deposit on the booking (paise). */
  requiredPaise: number;
  /** Additional deposit reservations (checkout holds, etc.) — paise. */
  reservedPaise: number;
  /** max(0, held − required − reserved). Not rent credit. */
  refundableDepositPaise: number;
  /** Open deposit_refund requests not yet paid out (paise). */
  pendingRefundPaise: number;
  /** max(0, refundableDeposit − pendingRefund). Max new request amount. */
  availableToRequestPaise: number;
};

const OPEN_DEPOSIT_REFUND_STATUSES = ['submitted', 'under_review', 'approved'] as const;

export function computeDepositRefundCeiling(input: {
  heldPaise: number;
  requiredPaise: number;
  reservedPaise?: number;
  pendingRefundPaise?: number;
}): DepositRefundCeiling {
  const heldPaise = guardDepositPaise(input.heldPaise, 'ceiling.heldPaise');
  const requiredPaise = guardDepositPaise(input.requiredPaise, 'ceiling.requiredPaise');
  const reservedPaise = guardDepositPaise(input.reservedPaise ?? 0, 'ceiling.reservedPaise');
  const pendingRefundPaise = guardDepositPaise(
    input.pendingRefundPaise ?? 0,
    'ceiling.pendingRefundPaise',
  );
  const refundableDepositPaise = Math.max(0, heldPaise - requiredPaise - reservedPaise);
  const availableToRequestPaise = Math.max(0, refundableDepositPaise - pendingRefundPaise);
  return {
    heldPaise,
    requiredPaise,
    reservedPaise,
    refundableDepositPaise,
    pendingRefundPaise,
    availableToRequestPaise,
  };
}

export function assertDepositRefundRequestAmountPaise(
  requestedPaise: number,
  ceiling: DepositRefundCeiling,
): { ok: true } | { ok: false; error: string } {
  const amount = guardDepositPaise(requestedPaise, 'request.amountPaise');
  if (amount <= 0) {
    return { ok: false, error: 'Refund amount must be greater than zero.' };
  }
  if (amount > ceiling.availableToRequestPaise) {
    return {
      ok: false,
      error: `Maximum refundable deposit is ${paiseToInr(ceiling.availableToRequestPaise)}.`,
    };
  }
  return { ok: true };
}

export async function sumPendingDepositRefundRequestPaise(bookingId: string): Promise<number> {
  const rows = await db
    .select({ amountPaise: residentRequests.amountPaise })
    .from(residentRequests)
    .where(
      and(
        eq(residentRequests.bookingId, bookingId),
        eq(residentRequests.type, 'deposit_refund'),
        inArray(residentRequests.status, [...OPEN_DEPOSIT_REFUND_STATUSES]),
      ),
    );
  return rows.reduce((sum, row) => sum + guardDepositPaise(row.amountPaise), 0);
}

export async function getDepositRefundCeilingForBooking(
  bookingId: string,
  options?: { reservedPaise?: number },
): Promise<DepositRefundCeiling | null> {
  const summary = await getDepositSummaryForBooking(bookingId);
  if (!summary) return null;

  const [booking] = await db
    .select({
      depositPaise: bookings.depositPaise,
      pricingSnapshot: bookings.pricingSnapshot,
    })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);
  if (!booking) return null;

  const snapshot = booking.pricingSnapshot as PricingSnapshot | null;
  const depositCredit = resolveBookingDepositCreditAppliedPaise(snapshot?.depositCredit);
  const requiredPaise = guardDepositPaise(
    booking.depositPaise - depositCredit,
    'ceiling.bookingRequired',
  );
  const heldPaise = summary.refundableBalancePaise;
  const pendingRefundPaise = await sumPendingDepositRefundRequestPaise(bookingId);

  return computeDepositRefundCeiling({
    heldPaise,
    requiredPaise,
    reservedPaise: options?.reservedPaise ?? 0,
    pendingRefundPaise,
  });
}
