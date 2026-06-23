/**
 * DR-02 — Checkout settlement is the canonical move-out deposit refund path.
 * Legacy admin/resident/vacating refund writers must not run when a checkout
 * settlement row exists for the booking (non-archived).
 */

import { and, eq, ne } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { checkoutSettlements } from '@/src/db/schema';
import { LEGACY_DEPOSIT_REFUND_BLOCKED_MESSAGE } from '@/src/lib/deposits/depositRefundMessages';

export { LEGACY_DEPOSIT_REFUND_BLOCKED_MESSAGE };

export async function findCheckoutSettlementBlockingLegacyDepositRefund(
  bookingId: string,
): Promise<{ id: string; status: string } | null> {
  const [row] = await db
    .select({
      id: checkoutSettlements.id,
      status: checkoutSettlements.status,
    })
    .from(checkoutSettlements)
    .where(
      and(
        eq(checkoutSettlements.bookingId, bookingId),
        ne(checkoutSettlements.status, 'archived'),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function assertLegacyDepositRefundAllowed(
  bookingId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const existing = await findCheckoutSettlementBlockingLegacyDepositRefund(bookingId);
  if (existing) {
    return { ok: false, error: LEGACY_DEPOSIT_REFUND_BLOCKED_MESSAGE };
  }
  return { ok: true };
}
