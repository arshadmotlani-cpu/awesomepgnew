/**
 * Checkout settlement repair — orphan removal, duplicate detection, integrity counts.
 */

import { eq, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { auditLog, checkoutSettlements } from '@/src/db/schema';
import {
  archiveCheckoutSettlement,
  cleanupCheckoutSettlementForVacating,
  deleteCheckoutSettlement,
  rebuildCheckoutSettlement,
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
  issueCount: number;
  orphanCount: number;
  duplicateCount: number;
  duplicateVacatingCount: number;
  archivedOnActiveCount: number;
};

export type CheckoutSettlementRepairResult = {
  removed: number;
  archived: number;
  rebuilt: number;
  skipped: number;
  failed: Array<{ settlementId: string; error: string }>;
  issueCountBefore: number;
  issueCountAfter: number;
  repairedCount: number;
  remainingCount: number;
};

const TERMINAL_VACATING = ['rejected'] as const;
const ACTIVE_SETTLEMENT_STATUSES = sql`('archived', 'completed', 'refund_paid')`;

type CanonicalKeepIds = {
  byBooking: Map<string, string>;
  byVacating: Map<string, string>;
};

async function resolveCanonicalSettlementIds(): Promise<CanonicalKeepIds> {
  const rows = await db.execute<{
    id: string;
    booking_id: string;
    vacating_request_id: string;
  }>(sql`
    SELECT
      cs.id::text AS id,
      cs.booking_id::text AS booking_id,
      cs.vacating_request_id::text AS vacating_request_id
    FROM checkout_settlements cs
    WHERE cs.status NOT IN ${ACTIVE_SETTLEMENT_STATUSES}
    ORDER BY cs.updated_at DESC, cs.created_at DESC
  `);

  const byBooking = new Map<string, string>();
  const byVacating = new Map<string, string>();
  for (const row of Array.from(rows)) {
    if (!byBooking.has(row.booking_id)) byBooking.set(row.booking_id, row.id);
    if (!byVacating.has(row.vacating_request_id)) {
      byVacating.set(row.vacating_request_id, row.id);
    }
  }
  return { byBooking, byVacating };
}

function isCanonicalSettlement(
  row: CheckoutSettlementRepairRow,
  canonical: CanonicalKeepIds,
): boolean {
  const bookingKeep = canonical.byBooking.get(row.bookingId);
  const vacatingKeep = canonical.byVacating.get(row.vacatingRequestId);
  return row.settlementId === bookingKeep && row.settlementId === vacatingKeep;
}

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
        WHEN vr.status = 'pending'
          AND cs.status NOT IN ('archived', 'completed', 'refund_paid')
          THEN 'Premature settlement — vacating still pending'
        WHEN vr.status = 'rejected' THEN 'Orphan — vacating rejected'
        WHEN cs.status = 'archived' AND vr.status IN ('pending', 'approved') THEN 'Archived settlement on active vacating'
        WHEN cs.status NOT IN ('archived', 'completed', 'refund_paid')
          AND EXISTS (
            SELECT 1 FROM checkout_settlements cs2
            WHERE cs2.vacating_request_id = cs.vacating_request_id
              AND cs2.id <> cs.id
              AND cs2.status NOT IN ('archived', 'completed', 'refund_paid')
          ) THEN 'Duplicate active vacating settlement'
        ELSE 'Duplicate active booking settlement'
      END AS issue
    FROM checkout_settlements cs
    INNER JOIN vacating_requests vr ON vr.id = cs.vacating_request_id
    WHERE vr.status = 'rejected'
       OR (
         vr.status = 'pending'
         AND cs.status NOT IN ('archived', 'completed', 'refund_paid')
       )
       OR (
         cs.status = 'archived'
         AND vr.status IN ('pending', 'approved')
       )
       OR (
         cs.status NOT IN ('archived', 'completed', 'refund_paid')
         AND EXISTS (
           SELECT 1 FROM checkout_settlements cs2
           WHERE cs2.vacating_request_id = cs.vacating_request_id
             AND cs2.id <> cs.id
             AND cs2.status NOT IN ('archived', 'completed', 'refund_paid')
         )
       )
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
    issueCount: mapped.length,
    orphanCount: mapped.filter((r) => TERMINAL_VACATING.includes(r.vacatingStatus as 'rejected')).length,
    duplicateCount: mapped.filter((r) => r.issue.startsWith('Duplicate active booking')).length,
    duplicateVacatingCount: mapped.filter((r) =>
      r.issue.startsWith('Duplicate active vacating'),
    ).length,
    archivedOnActiveCount: mapped.filter((r) => r.issue.startsWith('Archived')).length,
  };
}

export async function executeCheckoutSettlementRepair(input: {
  adminId: string;
  dryRun?: boolean;
}): Promise<CheckoutSettlementRepairResult> {
  const before = await previewCheckoutSettlementRepair();
  const canonical = await resolveCanonicalSettlementIds();
  const result: CheckoutSettlementRepairResult = {
    removed: 0,
    archived: 0,
    rebuilt: 0,
    skipped: 0,
    failed: [],
    issueCountBefore: before.issueCount,
    issueCountAfter: before.issueCount,
    repairedCount: 0,
    remainingCount: before.issueCount,
  };

  const seenSettlement = new Set<string>();

  for (const row of before.rows) {
    if (input.dryRun) {
      if (TERMINAL_VACATING.includes(row.vacatingStatus as 'rejected')) {
        result.removed += 1;
      } else if (row.issue.startsWith('Premature settlement')) {
        result.archived += 1;
      } else if (row.issue.startsWith('Archived')) {
        result.rebuilt += 1;
      } else if (row.issue.startsWith('Duplicate')) {
        if (!isCanonicalSettlement(row, canonical)) result.removed += 1;
        else result.skipped += 1;
      }
      continue;
    }

    try {
      if (TERMINAL_VACATING.includes(row.vacatingStatus as 'rejected')) {
        const cleaned = await cleanupCheckoutSettlementForVacating({
          vacatingRequestId: row.vacatingRequestId,
          adminId: input.adminId,
        });
        if (cleaned.action === 'deleted') result.removed += 1;
        else if (cleaned.action === 'archived') result.archived += 1;
        else result.skipped += 1;
        continue;
      }

      if (row.issue.startsWith('Premature settlement')) {
        const { archivePrematureCheckoutSettlementForVacating } = await import(
          '@/src/services/checkoutSettlement'
        );
        const repaired = await archivePrematureCheckoutSettlementForVacating({
          vacatingRequestId: row.vacatingRequestId,
          adminId: input.adminId,
          reason: row.issue,
        });
        if (repaired.ok) result.archived += 1;
        else {
          result.failed.push({ settlementId: row.settlementId, error: repaired.error });
        }
        continue;
      }

      if (row.issue.startsWith('Archived')) {
        const rebuilt = await rebuildCheckoutSettlement({
          settlementId: row.settlementId,
          adminId: input.adminId,
        });
        if (rebuilt.ok) result.rebuilt += 1;
        else {
          result.failed.push({ settlementId: row.settlementId, error: rebuilt.error });
        }
        continue;
      }

      if (row.issue.startsWith('Duplicate')) {
        if (isCanonicalSettlement(row, canonical)) {
          result.skipped += 1;
          continue;
        }
        if (seenSettlement.has(row.settlementId)) continue;
        seenSettlement.add(row.settlementId);

        const [settlement] = await db
          .select()
          .from(checkoutSettlements)
          .where(eq(checkoutSettlements.id, row.settlementId))
          .limit(1);
        if (!settlement) continue;

        if (
          settlement.amountsLocked ||
          settlement.status === 'refund_paid' ||
          settlement.status === 'completed'
        ) {
          await archiveCheckoutSettlement({
            settlementId: row.settlementId,
            adminId: input.adminId,
          });
          result.archived += 1;
          continue;
        }

        await deleteCheckoutSettlement({ settlementId: row.settlementId, adminId: input.adminId });
        result.removed += 1;
      }
    } catch (err) {
      result.failed.push({
        settlementId: row.settlementId,
        error: err instanceof Error ? err.message : 'Repair failed.',
      });
    }
  }

  const after = await previewCheckoutSettlementRepair();
  result.issueCountAfter = after.issueCount;
  result.repairedCount = Math.max(0, before.issueCount - after.issueCount);
  result.remainingCount = after.issueCount;

  if (!input.dryRun && (result.removed > 0 || result.archived > 0 || result.rebuilt > 0)) {
    await db.insert(auditLog).values({
      actorType: 'admin',
      actorId: input.adminId,
      entity: 'system',
      entityId: input.adminId,
      action: 'checkout_settlement_repair_executed',
      diff: {
        removed: result.removed,
        archived: result.archived,
        rebuilt: result.rebuilt,
        skipped: result.skipped,
        issueCountBefore: result.issueCountBefore,
        issueCountAfter: result.issueCountAfter,
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
