/**
 * Checkout settlement pipeline audit — open settlements vs vacating requests.
 */

import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { checkoutSettlements, vacatingRequests } from '@/src/db/schema';
import type { AdminSession } from '@/src/lib/auth/session';
import { listPipelineCheckoutSettlements } from '@/src/services/checkoutSettlement';
import { isStaleZeroRefundSettlement } from '@/src/lib/residents/checkoutOpsQueueCopy';

export type CheckoutAuditIssue = {
  code:
    | 'orphan_settlement'
    | 'missing_settlement'
    | 'stale_zero_refund_in_queue'
    | 'approved_without_vacating'
    | 'duplicate_settlement'
    | 'premature_settlement_pending_vacating';
  detail: string;
  settlementId?: string;
  vacatingRequestId?: string;
};

export type CheckoutAuditReport = {
  openSettlements: number;
  issues: CheckoutAuditIssue[];
  pass: boolean;
  summary: string;
};

export async function runCheckoutAudit(session: AdminSession): Promise<CheckoutAuditReport> {
  const settlements = await listPipelineCheckoutSettlements(session);
  const issues: CheckoutAuditIssue[] = [];

  const operational = settlements.filter((s) => s.status !== 'archived' && s.status !== 'completed');

  for (const s of operational) {
    if (isStaleZeroRefundSettlement(s)) {
      issues.push({
        code: 'stale_zero_refund_in_queue',
        detail: `Settlement ${s.id} (${s.status}) is stale zero-refund but still in pipeline`,
        settlementId: s.id,
        vacatingRequestId: s.vacatingRequestId ?? undefined,
      });
    }
  }

  const approvedVacating = await db
    .select({
      id: vacatingRequests.id,
      bookingId: vacatingRequests.bookingId,
      status: vacatingRequests.status,
    })
    .from(vacatingRequests)
    .where(inArray(vacatingRequests.status, ['approved', 'completed']));

  const settlementByVacating = new Map(
    settlements
      .filter((s) => s.vacatingRequestId)
      .map((s) => [s.vacatingRequestId!, s]),
  );

  for (const vr of approvedVacating) {
    if (vr.status === 'approved') {
      const settlement = settlementByVacating.get(vr.id);
      if (!settlement) {
        issues.push({
          code: 'missing_settlement',
          detail: `Approved vacating ${vr.id} has no checkout settlement`,
          vacatingRequestId: vr.id,
        });
      }
    }
  }

  const orphanSettlements = await db.execute<{ id: string; vacating_request_id: string | null }>(sql`
    SELECT cs.id, cs.vacating_request_id
    FROM checkout_settlements cs
    WHERE cs.status NOT IN ('archived', 'completed')
      AND cs.vacating_request_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM vacating_requests vr
        WHERE vr.id = cs.vacating_request_id
      )
    LIMIT 20
  `);

  for (const row of Array.from(orphanSettlements)) {
    issues.push({
      code: 'orphan_settlement',
      detail: `Settlement ${row.id} references missing vacating ${row.vacating_request_id}`,
      settlementId: row.id,
      vacatingRequestId: row.vacating_request_id ?? undefined,
    });
  }

  const duplicateRows = await db.execute<{ booking_id: string; cnt: string }>(sql`
    SELECT booking_id, COUNT(*)::text AS cnt
    FROM checkout_settlements
    WHERE status NOT IN ('archived', 'completed')
    GROUP BY booking_id
    HAVING COUNT(*) > 1
    LIMIT 10
  `);

  for (const row of Array.from(duplicateRows)) {
    issues.push({
      code: 'duplicate_settlement',
      detail: `Booking ${row.booking_id} has ${row.cnt} open settlements`,
    });
  }

  const approvedWithoutVacating = await db
    .select({ id: checkoutSettlements.id })
    .from(checkoutSettlements)
    .where(
      and(
        eq(checkoutSettlements.status, 'approved'),
        sql`${checkoutSettlements.vacatingRequestId} IS NULL`,
      ),
    )
    .limit(10);

  for (const row of approvedWithoutVacating) {
    issues.push({
      code: 'approved_without_vacating',
      detail: `Settlement ${row.id} approved but no vacating_request_id`,
      settlementId: row.id,
    });
  }

  const prematureRows = await db.execute<{
    settlement_id: string;
    vacating_request_id: string;
  }>(sql`
    SELECT cs.id::text AS settlement_id, cs.vacating_request_id::text AS vacating_request_id
    FROM checkout_settlements cs
    INNER JOIN vacating_requests vr ON vr.id = cs.vacating_request_id
    WHERE vr.status = 'pending'
      AND cs.status NOT IN ('archived', 'completed', 'refund_paid')
    LIMIT 20
  `);

  for (const row of Array.from(prematureRows)) {
    issues.push({
      code: 'premature_settlement_pending_vacating',
      detail: `Settlement ${row.settlement_id} exists while vacating ${row.vacating_request_id} is still pending`,
      settlementId: row.settlement_id,
      vacatingRequestId: row.vacating_request_id,
    });
  }

  return {
    openSettlements: operational.length,
    issues,
    pass: issues.length === 0,
    summary:
      issues.length === 0
        ? `${operational.length} open settlement(s) — pipeline consistent.`
        : `${issues.length} checkout issue(s) across ${operational.length} open settlement(s).`,
  };
}
