import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { bookings, depositLedger } from '@/src/db/schema';
import {
  getDepositSummaryForBooking,
  recordDepositCollected,
} from '@/src/services/deposits';
import { applyDepositDeduction } from '@/src/services/depositSettlement';

export type DepositCreditSummary = {
  totalCollectedPaise: number;
  totalHeldPaise: number;
  totalUsedPaise: number;
  totalRefundedPaise: number;
  availableCreditPaise: number;
  byBooking: Array<{
    bookingId: string;
    collectedPaise: number;
    deductedPaise: number;
    refundedPaise: number;
    availablePaise: number;
  }>;
};

/** Aggregate deposit wallet credit for a customer across confirmed bookings. */
export async function getCustomerDepositCredit(
  customerId: string,
): Promise<DepositCreditSummary> {
  const bookingRows = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(
      sql`${bookings.customerId} = ${customerId} AND ${bookings.status} IN ('confirmed', 'completed')`,
    );

  const byBooking: DepositCreditSummary['byBooking'] = [];
  let totalCollected = 0;
  let totalUsed = 0;
  let totalRefunded = 0;
  let available = 0;

  for (const b of bookingRows) {
    const summary = await getDepositSummaryForBooking(b.id);
    if (!summary) continue;
    byBooking.push({
      bookingId: b.id,
      collectedPaise: summary.collectedPaise,
      deductedPaise: summary.deductedPaise,
      refundedPaise: summary.refundedPaise,
      availablePaise: summary.refundableBalancePaise,
    });
    totalCollected += summary.collectedPaise;
    totalUsed += summary.deductedPaise;
    totalRefunded += summary.refundedPaise;
    available += summary.refundableBalancePaise;
  }

  return {
    totalCollectedPaise: totalCollected,
    totalHeldPaise: totalCollected - totalUsed - totalRefunded,
    totalUsedPaise: totalUsed,
    totalRefundedPaise: totalRefunded,
    availableCreditPaise: available,
    byBooking,
  };
}

/** How much additional deposit to collect given existing credit. */
export function computeDepositDue(requiredPaise: number, availableCreditPaise: number): {
  requiredPaise: number;
  creditAppliedPaise: number;
  additionalDuePaise: number;
} {
  const creditAppliedPaise = Math.min(requiredPaise, Math.max(0, availableCreditPaise));
  return {
    requiredPaise,
    creditAppliedPaise,
    additionalDuePaise: Math.max(0, requiredPaise - creditAppliedPaise),
  };
}

const DEPOSIT_CREDIT_REASON = 'Deposit credit applied from prior stay wallet';

/**
 * Move deposit credit from prior confirmed bookings onto a new booking.
 * Idempotent — skips if credit was already applied to the target booking.
 */
export async function applyDepositCreditToBooking(input: {
  customerId: string;
  targetBookingId: string;
  creditPaise: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (input.creditPaise <= 0) return { ok: true };

  const [existing] = await db
    .select({ id: depositLedger.id })
    .from(depositLedger)
    .where(
      and(
        eq(depositLedger.bookingId, input.targetBookingId),
        eq(depositLedger.entryKind, 'collected'),
        eq(depositLedger.reason, DEPOSIT_CREDIT_REASON),
      ),
    )
    .limit(1);
  if (existing) return { ok: true };

  const wallet = await getCustomerDepositCredit(input.customerId);
  let remaining = input.creditPaise;

  const sources = wallet.byBooking
    .filter((b) => b.bookingId !== input.targetBookingId && b.availablePaise > 0)
    .sort((a, b) => b.availablePaise - a.availablePaise);

  for (const source of sources) {
    if (remaining <= 0) break;
    const slice = Math.min(remaining, source.availablePaise);
    const deducted = await applyDepositDeduction({
      bookingId: source.bookingId,
      customerId: input.customerId,
      amountPaise: slice,
      reason: `Deposit credit transferred to booking ${input.targetBookingId}`,
    });
    if (!deducted.ok) {
      return { ok: false, error: deducted.error };
    }
    remaining -= slice;
  }

  if (remaining > 0) {
    return { ok: false, error: 'Insufficient deposit credit at payment time' };
  }

  await recordDepositCollected({
    bookingId: input.targetBookingId,
    customerId: input.customerId,
    amountPaise: input.creditPaise,
    reason: DEPOSIT_CREDIT_REASON,
  });

  return { ok: true };
}
