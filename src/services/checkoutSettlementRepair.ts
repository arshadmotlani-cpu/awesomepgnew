/**
 * Checkout settlement repair — orphan removal and duplicate detection.
 */

import { eq, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { auditLog, checkoutSettlements } from '@/src/db/schema';
import {
  cleanupCheckoutSettlementForVacating,
  deleteCheckoutSettlement,
} from '@/src/services/checkoutSettlement';

export type CheckoutSettlementRepairRow = {
  settlementId: string;
  bookingId: string;
  vacatingRequestId: string;
  vacatingStatus: string;
  settlementStatus: string;
  issue: string;
};

export type CheckoutSettlementRepairPreview = {
  rows: CheckoutSettlementRepairRow[];
  orphanCount: number;
  duplicateCount: number;
};

export type CheckoutSettlementRepairResult = {
  removed: number;
  archived: number;
  skipped: number;
  failed: Array<{ settlementId: string; error: string }>;
};

const TERMINAL_VACATING = ['rejected', 'cancelled'] as const;

export async function previewCheckoutSettlementRepair(): Promise<CheckoutSettlementRepairPreview> {
  const rows = await db.execute<{
    settlement_id: string;
    booking_id: string;
    vacating_request_id: string;
    vacating_status: string;
    settlement_status: string;
    issue: string;
  }>(sql`
    SELECT
      cs.id::text AS settlement_id,
      cs.booking_id::text AS booking_id,
      cs.vacating_request_id::text AS vacating_request_id,
      vr.status::text AS vacating_status,
      cs.status::text AS settlement_status,
      CASE
        WHEN vr.status IN ('rejected', 'cancelled') THEN 'Orphan — vacating ' || vr.status
        WHEN cs.status = 'archived' AND vr.status IN ('pending', 'approved') THEN 'Archived settlement on active vacating'
        ELSE 'Duplicate booking settlement'
      END AS issue
    FROM checkout_settlements cs
    INNER JOIN vacating_requests vr ON vr.id = cs.vacating_request_id
    WHERE vr.status IN ('rejected', 'cancelled')
       OR (
         cs.status NOT IN ('archived', 'completed', 'refund_paid')
         AND EXISTS (
           SELECT 1 FROM checkout_settlements cs2
           WHERE cs2.booking_id = cs.booking_id
             AND cs2.id <> cs.id
             AND cs2.status NOT IN ('archived', 'completed', 'refund_paid')
         )
       )
    ORDER BY cs.updated_at DESC
  `);

  const mapped: CheckoutSettlementRepairRow[] = Array.from(rows).map((r) => ({
    settlementId: r.settlement_id,
    bookingId: r.booking_id,
    vacatingRequestId: r.vacating_request_id,
    vacatingStatus: r.vacating_status,
    settlementStatus: r.settlement_status,
    issue: r.issue,
  }));

  return {
    rows: mapped,
    orphanCount: mapped.filter((r) => TERMINAL_VACATING.includes(r.vacatingStatus as 'rejected' | 'cancelled')).length,
    duplicateCount: mapped.filter((r) => r.issue.startsWith('Duplicate')).length,
  };
}

export async function executeCheckoutSettlementRepair(input: {
  adminId: string;
  dryRun?: boolean;
}): Promise<CheckoutSettlementRepairResult> {
  const preview = await previewCheckoutSettlementRepair();
  const result: CheckoutSettlementRepairResult = {
    removed: 0,
    archived: 0,
    skipped: 0,
    failed: [],
  };

  const seenVacating = new Set<string>();

  for (const row of preview.rows) {
    if (seenVacating.has(row.vacatingRequestId)) continue;
    seenVacating.add(row.vacatingRequestId);

    if (input.dryRun) {
      if (TERMINAL_VACATING.includes(row.vacatingStatus as 'rejected' | 'cancelled')) {
        result.removed += 1;
      } else {
        result.archived += 1;
      }
      continue;
    }

    try {
      const [settlement] = await db
        .select()
        .from(checkoutSettlements)
        .where(eq(checkoutSettlements.id, row.settlementId))
        .limit(1);
      if (!settlement) continue;

      if (TERMINAL_VACATING.includes(row.vacatingStatus as 'rejected' | 'cancelled')) {
        const cleaned = await cleanupCheckoutSettlementForVacating({
          vacatingRequestId: row.vacatingRequestId,
          adminId: input.adminId,
        });
        if (cleaned.action === 'deleted') result.removed += 1;
        else if (cleaned.action === 'archived') result.archived += 1;
        else result.skipped += 1;
        continue;
      }

      if (
        settlement.amountsLocked ||
        settlement.status === 'refund_paid' ||
        settlement.status === 'completed'
      ) {
        result.skipped += 1;
        continue;
      }

      await deleteCheckoutSettlement({ settlementId: row.settlementId, adminId: input.adminId });
      result.removed += 1;
    } catch (err) {
      result.failed.push({
        settlementId: row.settlementId,
        error: err instanceof Error ? err.message : 'Repair failed.',
      });
    }
  }

  if (!input.dryRun && (result.removed > 0 || result.archived > 0)) {
    await db.insert(auditLog).values({
      actorType: 'admin',
      actorId: input.adminId,
      entity: 'system',
      entityId: input.adminId,
      action: 'checkout_settlement_repair_executed',
      diff: {
        removed: result.removed,
        archived: result.archived,
        skipped: result.skipped,
        failed: result.failed.slice(0, 20),
      },
    });
  }

  return result;
}

/** List duplicate active settlements per booking for diagnostics. */
export async function listDuplicateCheckoutSettlements(): Promise<
  Array<{ bookingId: string; count: number; settlementIds: string[] }>
> {
  const rows = await db.execute<{ booking_id: string; count: number; ids: string[] }>(sql`
    SELECT
      cs.booking_id::text AS booking_id,
      count(*)::int AS count,
      array_agg(cs.id::text ORDER BY cs.created_at) AS ids
    FROM checkout_settlements cs
    WHERE cs.status NOT IN ('archived', 'completed', 'refund_paid')
    GROUP BY cs.booking_id
    HAVING count(*) > 1
  `);
  return Array.from(rows).map((r) => ({
    bookingId: r.booking_id,
    count: r.count,
    settlementIds: r.ids,
  }));
}
