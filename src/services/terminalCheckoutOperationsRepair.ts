/**
 * Close operational queue noise when checkout is terminal (bed released, ₹0 refund, etc.).
 * Does not modify settlement ledger rows — only vacating status + admin refund flags + action sync.
 */
import { sql } from 'drizzle-orm';
import { db } from '@/src/db/client';

export type TerminalCheckoutRepairResult = {
  staleSettlementsCompleted: number;
  vacatingCompleted: number;
  bookingsRefundFlagFixed: number;
};

export type ScopedTerminalCheckoutRepairInput = {
  customerId?: string | null;
  bookingId?: string | null;
  vacatingRequestId?: string | null;
  settlementId?: string | null;
};

function scopeClause(input: ScopedTerminalCheckoutRepairInput, alias: string): ReturnType<typeof sql> {
  const parts: ReturnType<typeof sql>[] = [];
  if (input.settlementId) {
    parts.push(sql`${sql.raw(alias)}.id = ${input.settlementId}::uuid`);
  }
  if (input.bookingId) {
    parts.push(sql`${sql.raw(alias)}.booking_id = ${input.bookingId}::uuid`);
  }
  if (input.customerId) {
    parts.push(sql`${sql.raw(alias)}.customer_id = ${input.customerId}::uuid`);
  }
  if (input.vacatingRequestId) {
    parts.push(sql`${sql.raw(alias)}.vacating_request_id = ${input.vacatingRequestId}::uuid`);
  }
  if (parts.length === 0) return sql`TRUE`;
  return sql.join(parts, sql` OR `);
}

/** Complete refund_pending settlements with ₹0 due — they should never block the Operations queue. */
export async function completeStaleZeroRefundSettlements(
  scope?: ScopedTerminalCheckoutRepairInput,
): Promise<number> {
  const whereScope = scope ? scopeClause(scope, 'cs') : sql`TRUE`;
  const rows = await db.execute<{ id: string }>(sql`
    UPDATE checkout_settlements cs
    SET status = 'completed', updated_at = now()
    WHERE cs.status = 'refund_pending'
      AND COALESCE(cs.final_refund_paise, 0) <= 0
      AND (${whereScope})
    RETURNING cs.id
  `);
  return rows.length;
}

export async function repairTerminalCheckoutOperations(
  scope?: ScopedTerminalCheckoutRepairInput,
): Promise<TerminalCheckoutRepairResult> {
  const staleSettlementsCompleted = await completeStaleZeroRefundSettlements(scope);

  const vacatingScope = scope
    ? sql`AND (${scopeClause(scope, 'vr')} OR ${scopeClause(scope, 'cs')})`
    : sql``;

  const vacatingCompleted = await db.execute<{ id: string }>(sql`
    UPDATE vacating_requests vr
    SET
      status = 'completed',
      resolved_at = COALESCE(vr.resolved_at, now()),
      updated_at = now()
    FROM checkout_settlements cs
    WHERE cs.vacating_request_id = vr.id
      AND cs.status IN ('completed', 'refund_paid')
      AND vr.status IN ('pending', 'approved')
      ${vacatingScope}
    RETURNING vr.id
  `);

  const bookingScope = scope?.bookingId
    ? sql`AND b.id = ${scope.bookingId}::uuid`
    : scope?.customerId
      ? sql`AND b.customer_id = ${scope.customerId}::uuid`
      : sql``;

  const bookingsRefundFlagFixed = await db.execute<{ id: string }>(sql`
    UPDATE bookings b
    SET admin_deposit_refund_status = 'refunded', updated_at = now()
    FROM checkout_settlements cs
    WHERE cs.booking_id = b.id
      AND cs.status IN ('completed', 'refund_paid')
      AND COALESCE(cs.final_refund_paise, 0) <= 0
      AND b.admin_deposit_refund_status = 'pending'
      ${bookingScope}
    RETURNING b.id
  `);

  return {
    staleSettlementsCompleted,
    vacatingCompleted: vacatingCompleted.length,
    bookingsRefundFlagFixed: bookingsRefundFlagFixed.length,
  };
}

/** Super Admin dismiss — close stale domain rows that still feed the Operations queue. */
export async function repairOperationsQueueSourceOnDismiss(
  input: ScopedTerminalCheckoutRepairInput,
): Promise<TerminalCheckoutRepairResult> {
  return repairTerminalCheckoutOperations(input);
}
