import { eq, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { bookings } from '@/src/db/schema';
import { getDepositSummaryForBooking } from '@/src/services/deposits';

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
