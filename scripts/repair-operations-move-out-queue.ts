/**
 * Repair ghost move-out queue rows — vacating still open after terminal checkout.
 *
 * Usage: npx tsx scripts/repair-operations-move-out-queue.ts [--dry-run]
 */
import { loadScriptEnv } from '../src/lib/scripts/loadScriptEnv';
loadScriptEnv();

import { sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { hasDatabaseUrl } from '@/src/lib/db/env';
import type { AdminSession } from '@/src/lib/auth/session';
import { listAdminVacatingRequests } from '@/src/db/queries/admin';
import { activePipelineItems, buildMoveOutPipeline } from '@/src/lib/moveOut/moveOutPipeline';
import { guardDepositPaise } from '@/src/lib/deposits/paiseSafety';
import { loadUnifiedOperationsQueue } from '../src/services/unifiedOperationsQueue';
import {
  repairTerminalCheckoutOperations,
} from '../src/services/terminalCheckoutOperationsRepair';
import {
  resolveTerminalCheckoutUnresolvedActions,
} from '../src/services/unresolvedActionSync';
import { syncUnresolvedActionsFromDomain } from '../src/services/unresolvedActionSync';

const CRON: AdminSession = {
  kind: 'admin',
  sessionId: 'repair',
  adminId: 'repair',
  email: 'repair@system',
  fullName: 'Repair',
  role: 'super_admin',
  pgScope: [],
  mustChangePassword: false,
  rememberMe: false,
  expiresAt: new Date(Date.now() + 86_400_000),
};

async function listPhantomVacatingRows(opsVacatingIds: Set<string>) {
  const vacatingRes = await listAdminVacatingRequests();
  if (!vacatingRes.ok) throw new Error(vacatingRes.error);

  const rows = await db.execute<{
    id: string;
    booking_id: string;
    booking_code: string;
    customer_name: string;
    status: string;
    vacating_date: string;
    settlement_status: string | null;
    settlement_id: string | null;
    final_refund_paise: number | null;
  }>(sql`
    SELECT
      vr.id,
      vr.booking_id,
      b.booking_code,
      c.full_name AS customer_name,
      vr.status,
      vr.vacating_date::text,
      cs.status AS settlement_status,
      cs.id::text AS settlement_id,
      cs.final_refund_paise
    FROM vacating_requests vr
    INNER JOIN bookings b ON b.id = vr.booking_id
    INNER JOIN customers c ON c.id = vr.customer_id
    LEFT JOIN checkout_settlements cs ON cs.vacating_request_id = vr.id
    WHERE vr.checkout_settlement_suppressed = false
      AND vr.status IN ('pending', 'approved')
    ORDER BY vr.updated_at DESC
  `);

  const phantoms: Array<(typeof rows)[number] & { reason: string }> = [];

  for (const row of rows) {
    const vacatingRow = vacatingRes.data.find((v) => v.id === row.id);
    if (!vacatingRow) continue;

    const pipeline = buildMoveOutPipeline({
      vacatingRows: [
        {
          id: vacatingRow.id,
          bookingId: vacatingRow.bookingId,
          bookingCode: vacatingRow.bookingCode,
          customerId: vacatingRow.customerId,
          customerFullName: vacatingRow.customerFullName,
          customerPhone: vacatingRow.customerPhone,
          pgName: vacatingRow.pgName,
          bedCode: vacatingRow.bedCode,
          roomNumber: vacatingRow.roomNumber,
          noticeGivenDate: vacatingRow.noticeGivenDate,
          vacatingDate: vacatingRow.vacatingDate,
          noticeCompliant: vacatingRow.noticeCompliant,
          status: vacatingRow.status,
          resolvedAt: vacatingRow.resolvedAt,
          createdAt: vacatingRow.createdAt,
          updatedAt: vacatingRow.updatedAt,
          deductionPaise: guardDepositPaise(vacatingRow.deductionPaise),
          depositHeldPaise: 0,
          durationMode: vacatingRow.durationMode,
          stayType: vacatingRow.stayType,
        },
      ],
      settlements: row.settlement_id
        ? [
            {
              id: row.settlement_id,
              vacatingRequestId: row.id,
              status: row.settlement_status as 'completed',
              createdAt: new Date(),
              updatedAt: new Date(),
              approvedAt: null,
              refundPaidAt: null,
              finalRefundPaise: row.final_refund_paise,
            },
          ]
        : [],
    });

    const active = activePipelineItems(pipeline);
    const inOpsQueue = opsVacatingIds.has(row.id);

    if (active.length === 0 || !inOpsQueue) {
      let reason = 'Excluded from Operations Move-out queue';
      if (row.settlement_status === 'completed' || row.settlement_status === 'refund_paid') {
        reason = 'Checkout terminal but vacating still open';
      } else if (row.settlement_status === 'awaiting_resident_details') {
        reason = 'Waiting on resident — not an admin queue item';
      } else if (active.length === 0) {
        reason = 'Pipeline terminal (bed released)';
      }
      phantoms.push({ ...row, reason });
    }
  }

  return phantoms;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  if (!hasDatabaseUrl()) {
    console.error('DATABASE_URL is not set.');
    process.exit(1);
  }

  console.log('\n=== Operations Move-out queue repair ===\n');

  const before = await loadUnifiedOperationsQueue(CRON, 'vacating_requests');
  console.log(`Move-out queue before: badge=${before.filterCounts.find((c) => c.id === 'vacating_requests')?.count ?? 0} rows=${before.items.length}`);

  const phantoms = await listPhantomVacatingRows(
    new Set(before.items.map((i) => i.vacatingRequestId).filter(Boolean) as string[]),
  );
  if (phantoms.length === 0) {
    console.log('No phantom vacating rows detected.');
  } else {
    console.log(`Found ${phantoms.length} phantom vacating row(s):\n`);
    for (const row of phantoms) {
      console.log(
        `  - ${row.customer_name} · ${row.booking_code} · vacating ${row.vacating_date} · status=${row.status} · settlement=${row.settlement_status ?? 'none'} · ${row.reason}`,
      );
    }
  }

  if (dryRun) {
    console.log('\nDry run — no writes.');
    process.exit(0);
  }

  const repair = await repairTerminalCheckoutOperations();
  const unresolvedClosed = await resolveTerminalCheckoutUnresolvedActions();
  await syncUnresolvedActionsFromDomain(CRON);

  console.log('\nRepair applied:');
  console.log(`  stale zero-refund settlements completed: ${repair.staleSettlementsCompleted}`);
  console.log(`  vacating requests marked completed: ${repair.vacatingCompleted}`);
  console.log(`  booking refund flags fixed: ${repair.bookingsRefundFlagFixed}`);
  console.log(`  stale unresolved actions closed: ${unresolvedClosed}`);

  const after = await loadUnifiedOperationsQueue(CRON, 'vacating_requests');
  const badge = after.filterCounts.find((c) => c.id === 'vacating_requests')?.count ?? 0;
  console.log(`\nMove-out queue after: badge=${badge} rows=${after.items.length}`);
  console.log(badge === after.items.length ? 'PASS — badge matches visible rows.' : 'FAIL — parity broken.');
  process.exit(badge === after.items.length ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
