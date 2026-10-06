/**
 * Mid-stay unused prepaid rent (room-change surplus) — refundable now, separate from deposit escrow.
 */

import { and, eq, inArray, or, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { residentCreditLedger, residentRequests } from '@/src/db/schema';
import { guardDepositPaise } from '@/src/lib/deposits/paiseSafety';
import { paiseToInr } from '@/src/lib/format';
import {
  isRefundableUnusedPrepaidRentLedgerReason,
  isPrepaidRentRefundPayoutDebitReason,
} from '@/src/services/residentCreditLedger';

export type PrepaidRentRefundCeiling = {
  /** Net unused prepaid rent from categorized ledger rows (paise). */
  netUnusedPrepaidRentPaise: number;
  /** Open prepaid_rent_refund requests (paise). */
  pendingRefundPaise: number;
  /** max(0, net − pending). */
  availableToRequestPaise: number;
};

const OPEN_PREPAID_REFUND_STATUSES = ['submitted', 'under_review', 'approved'] as const;

export function computePrepaidRentRefundCeiling(input: {
  netUnusedPrepaidRentPaise: number;
  pendingRefundPaise?: number;
}): PrepaidRentRefundCeiling {
  const netUnusedPrepaidRentPaise = guardDepositPaise(
    input.netUnusedPrepaidRentPaise,
    'prepaid.net',
  );
  const pendingRefundPaise = guardDepositPaise(
    input.pendingRefundPaise ?? 0,
    'prepaid.pending',
  );
  const availableToRequestPaise = Math.max(0, netUnusedPrepaidRentPaise - pendingRefundPaise);
  return {
    netUnusedPrepaidRentPaise,
    pendingRefundPaise,
    availableToRequestPaise,
  };
}

export function assertPrepaidRentRefundRequestAmountPaise(
  requestedPaise: number,
  ceiling: PrepaidRentRefundCeiling,
): { ok: true } | { ok: false; error: string } {
  const amount = guardDepositPaise(requestedPaise, 'prepaid.request');
  if (amount <= 0) {
    return { ok: false, error: 'Refund amount must be greater than zero.' };
  }
  if (amount > ceiling.availableToRequestPaise) {
    return {
      ok: false,
      error: `Maximum refundable unused prepaid rent is ${paiseToInr(ceiling.availableToRequestPaise)}.`,
    };
  }
  return { ok: true };
}

export async function sumPendingPrepaidRentRefundRequestPaise(bookingId: string): Promise<number> {
  try {
    const rows = await db
      .select({ amountPaise: residentRequests.amountPaise })
      .from(residentRequests)
      .where(
        and(
          eq(residentRequests.bookingId, bookingId),
          eq(residentRequests.type, 'prepaid_rent_refund'),
          inArray(residentRequests.status, [...OPEN_PREPAID_REFUND_STATUSES]),
        ),
      );
    return rows.reduce((sum, row) => sum + guardDepositPaise(row.amountPaise), 0);
  } catch {
    // Enum migration 0154 not applied yet — no prepaid refund reservations possible.
    return 0;
  }
}

/**
 * Sum ledger rows that represent unused prepaid rent from room change (+ reconciliation),
 * minus applies and payout debits for the same booking.
 */
export async function getUnusedPrepaidRentNetPaiseForBooking(input: {
  customerId: string;
  bookingId: string;
}): Promise<number> {
  const rows = await db
    .select({
      amountPaise: residentCreditLedger.amountPaise,
      reason: residentCreditLedger.reason,
      entryKind: residentCreditLedger.entryKind,
      bookingId: residentCreditLedger.bookingId,
    })
    .from(residentCreditLedger)
    .where(
      and(
        eq(residentCreditLedger.customerId, input.customerId),
        or(
          eq(residentCreditLedger.bookingId, input.bookingId),
          sql`${residentCreditLedger.bookingId} IS NULL`,
        ),
      ),
    );

  let net = 0;
  for (const row of rows) {
    const reason = row.reason ?? '';
    if (isRefundableUnusedPrepaidRentLedgerReason(reason)) {
      net += row.amountPaise;
      continue;
    }
    if (isPrepaidRentRefundPayoutDebitReason(reason)) {
      net += row.amountPaise;
      continue;
    }
    if (reason.startsWith('room_change_credit_apply:')) {
      net += row.amountPaise;
      continue;
    }
    if (row.entryKind === 'applied' && row.bookingId === input.bookingId) {
      net += row.amountPaise;
    }
  }

  return Math.max(0, net);
}

export async function getPrepaidRentRefundCeilingForBooking(input: {
  customerId: string;
  bookingId: string;
}): Promise<PrepaidRentRefundCeiling> {
  const netUnusedPrepaidRentPaise = await getUnusedPrepaidRentNetPaiseForBooking(input);
  const pendingRefundPaise = await sumPendingPrepaidRentRefundRequestPaise(input.bookingId);
  return computePrepaidRentRefundCeiling({ netUnusedPrepaidRentPaise, pendingRefundPaise });
}
