#!/usr/bin/env npx tsx
/**
 * Audit move-out settlement explainability for all non-terminal active move-outs.
 *
 *   USE_PRODUCTION_DB=1 npx tsx scripts/audit-active-moveout-settlement-explanations.ts
 *
 * Read-only. Exit 1 if any resident fails consistency checks.
 */
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('audit-active-moveout-settlement-explanations.ts');

import { closeDb } from '@/src/db/client';
import { guardDepositPaise } from '@/src/lib/deposits/paiseSafety';
import { buildMoveOutPipeline, type MoveOutPipelineItem } from '@/src/lib/moveOut/moveOutPipeline';
import { isTerminalVacatingPipelineItem } from '@/src/lib/operations/moveOutAdminAction';
import { loadVacatingBillingPresentation } from '@/src/lib/vacating/loadVacatingBillingPresentation';
import {
  buildMoveOutSettlementExplanations,
  groupFailuresBySignature,
  validateMoveOutSettlementExplanations,
} from '@/src/lib/vacating/moveOutSettlementExplanation';
import { listAdminVacatingRequests } from '@/src/db/queries/admin';
import { getDepositSummaryForBooking } from '@/src/services/deposits';

type ScanRow = {
  vacatingRequestId: string;
  bookingId: string;
  bookingCode: string;
  customerName: string;
  vacatingStatus: string;
  vacatingDate: string;
  noticeGivenDate: string;
  monthlyRentPaiseSnapshot: number;
  stayType: string | null;
  durationMode: string | null;
  deductionPaise: number;
  stage: string;
};

async function main() {
  const vacatingRes = await listAdminVacatingRequests();
  if (!vacatingRes.ok) {
    console.error('Failed to list vacating:', vacatingRes.error);
    process.exit(2);
  }

  const depositHeldByBooking: Record<string, number> = {};
  for (const v of vacatingRes.data) {
    if (depositHeldByBooking[v.bookingId] != null) continue;
    try {
      const wallet = await getDepositSummaryForBooking(v.bookingId);
      depositHeldByBooking[v.bookingId] = guardDepositPaise(wallet?.refundableBalancePaise ?? 0);
    } catch {
      depositHeldByBooking[v.bookingId] = guardDepositPaise(v.depositRefundPaise);
    }
  }

  const pipeline = buildMoveOutPipeline({
    vacatingRows: vacatingRes.data.map((v) => ({
      id: v.id,
      bookingId: v.bookingId,
      bookingCode: v.bookingCode,
      customerId: v.customerId,
      customerFullName: v.customerFullName,
      customerPhone: v.customerPhone,
      pgName: v.pgName,
      bedCode: v.bedCode,
      roomNumber: v.roomNumber,
      noticeGivenDate: v.noticeGivenDate,
      vacatingDate: v.vacatingDate,
      noticeCompliant: v.noticeCompliant,
      status: v.status,
      resolvedAt: v.resolvedAt,
      createdAt: v.createdAt,
      updatedAt: v.updatedAt,
      deductionPaise: v.deductionPaise,
      depositHeldPaise: depositHeldByBooking[v.bookingId] ?? 0,
    })),
    settlements: [],
  });

  const activeItems = pipeline.filter(
    (item) =>
      !isTerminalVacatingPipelineItem({
        stage: item.stage,
        vacatingStatus: item.vacatingStatus,
        settlementStatus: item.settlementStatus,
      }),
  );

  const byRequestId = new Map(vacatingRes.data.map((v) => [v.id, v]));

  const scanRows: ScanRow[] = activeItems.map((item: MoveOutPipelineItem) => {
    const v = byRequestId.get(item.vacatingRequestId)!;
    return {
      vacatingRequestId: item.vacatingRequestId,
      bookingId: item.bookingId,
      bookingCode: item.bookingCode,
      customerName: item.customerFullName,
      vacatingStatus: item.vacatingStatus,
      vacatingDate: String(v.vacatingDate),
      noticeGivenDate: String(v.noticeGivenDate),
      monthlyRentPaiseSnapshot: v.monthlyRentPaiseSnapshot,
      stayType: v.stayType,
      durationMode: v.durationMode,
      deductionPaise: v.deductionPaise,
      stage: item.stage,
    };
  });

  console.log(`\nMove-out settlement explainability audit`);
  console.log(`Active non-terminal move-outs: ${scanRows.length}\n`);

  const failed: Array<{
    bookingCode: string;
    vacatingRequestId: string;
    stage: string;
    failures: ReturnType<typeof validateMoveOutSettlementExplanations>['failures'];
  }> = [];

  let pass = 0;
  let loadErrors = 0;

  for (const row of scanRows) {
    try {
      const presentation = await loadVacatingBillingPresentation({
        bookingId: row.bookingId,
        noticeGivenDate: row.noticeGivenDate,
        vacatingDate: row.vacatingDate,
        monthlyRentPaiseSnapshot: row.monthlyRentPaiseSnapshot,
        stayType: row.stayType,
        durationMode: row.durationMode,
        mode: 'estimate',
        treatAsApprovedForTail: true,
      });

      if (!presentation) {
        loadErrors += 1;
        failed.push({
          bookingCode: row.bookingCode,
          vacatingRequestId: row.vacatingRequestId,
          stage: row.stage,
          failures: [
            {
              code: 'EXPLANATION_GAP',
              message: 'loadVacatingBillingPresentation returned null',
              signature: 'PRESENTATION_LOAD_FAILED',
            },
          ],
        });
        continue;
      }

      const report = buildMoveOutSettlementExplanations(presentation, {
        bookingId: row.bookingId,
        bookingCode: row.bookingCode,
        residentName: row.customerName,
        vacatingRequestId: row.vacatingRequestId,
      });

      const validation = validateMoveOutSettlementExplanations(report, presentation, {
        storedNoticeDeductionPaise: row.vacatingStatus === 'pending' ? row.deductionPaise : null,
      });

      if (validation.ok) {
        pass += 1;
        console.log(`PASS ${row.bookingCode} (${row.vacatingStatus}, stage ${row.stage})`);
      } else {
        failed.push({
          bookingCode: row.bookingCode,
          vacatingRequestId: row.vacatingRequestId,
          stage: row.stage,
          failures: validation.failures,
        });
        console.log(
          `FAIL ${row.bookingCode} (${row.vacatingStatus}): ${validation.failures.map((f) => f.signature).join(', ')}`,
        );
      }
    } catch (err) {
      loadErrors += 1;
      failed.push({
        bookingCode: row.bookingCode,
        vacatingRequestId: row.vacatingRequestId,
        stage: row.stage,
        failures: [
          {
            code: 'EXPLANATION_GAP',
            message: err instanceof Error ? err.message : String(err),
            signature: 'PRESENTATION_EXCEPTION',
          },
        ],
      });
    }
  }

  console.log(`\n--- Summary ---`);
  console.log(`Pass: ${pass}`);
  console.log(`Fail: ${failed.length}`);
  console.log(`Load errors: ${loadErrors}`);

  if (failed.length > 0) {
    const grouped = groupFailuresBySignature(
      failed.map((f) => ({ bookingCode: f.bookingCode, failures: f.failures })),
    );
    console.log(`\n--- Failures by signature (root cause candidates) ---`);
    for (const [sig, info] of [...grouped.entries()].sort((a, b) => b[1].count - a[1].count)) {
      console.log(`\n${sig} (${info.count} occurrences, ${info.bookingCodes.length} bookings)`);
      console.log(`  Sample: ${info.sample}`);
      console.log(`  Bookings: ${info.bookingCodes.join(', ')}`);
    }

    console.log(`\n--- Per resident ---`);
    for (const f of failed) {
      console.log(
        `${f.bookingCode} vr=${f.vacatingRequestId.slice(0, 8)} stage=${f.stage} codes=${f.failures.map((x) => x.code).join('|')}`,
      );
    }
  }

  await closeDb();
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
