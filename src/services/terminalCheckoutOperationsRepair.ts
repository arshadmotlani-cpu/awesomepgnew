/**
 * Close operational queue noise when checkout is terminal (bed released, ₹0 refund, etc.).
 * Does not modify settlement ledger rows — only vacating status + admin refund flags + action sync.
 */
import { sql } from 'drizzle-orm';
import { db } from '@/src/db/client';

export type TerminalCheckoutRepairResult = {
  vacatingCompleted: number;
  bookingsRefundFlagFixed: number;
};

export async function repairTerminalCheckoutOperations(): Promise<TerminalCheckoutRepairResult> {
  const vacatingCompleted = await db.execute<{ id: string }>(sql`
    UPDATE vacating_requests vr
    SET
      status = 'completed',
      resolved_at = COALESCE(vr.resolved_at, now()),
      updated_at = now()
    FROM checkout_settlements cs
    WHERE cs.vacating_request_id = vr.id
      AND cs.status IN ('completed', 'refund_paid')
      AND vr.status = 'approved'
    RETURNING vr.id
  `);

  const bookingsRefundFlagFixed = await db.execute<{ id: string }>(sql`
    UPDATE bookings b
    SET admin_deposit_refund_status = 'refunded', updated_at = now()
    FROM checkout_settlements cs
    WHERE cs.booking_id = b.id
      AND cs.status IN ('completed', 'refund_paid')
      AND COALESCE(cs.final_refund_paise, 0) <= 0
      AND b.admin_deposit_refund_status = 'pending'
    RETURNING b.id
  `);

  return {
    vacatingCompleted: vacatingCompleted.length,
    bookingsRefundFlagFixed: bookingsRefundFlagFixed.length,
  };
}
