#!/usr/bin/env npx tsx
/**
 * Final production billing engine validation — all active move-outs + completed samples.
 *
 *   USE_PRODUCTION_DB=1 npx tsx scripts/validate-active-moveout-billing-engine.ts
 *   USE_PRODUCTION_DB=1 npx tsx scripts/validate-active-moveout-billing-engine.ts --completed-limit=12
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('validate-active-moveout-billing-engine.ts');

import { closeDb } from '@/src/db/client';
import { guardDepositPaise } from '@/src/lib/deposits/paiseSafety';
import { validateMoveOutBillingRow } from '@/src/lib/billing/moveOutBillingEngineAudit';
import { buildMoveOutPipeline } from '@/src/lib/moveOut/moveOutPipeline';
import { isTerminalVacatingPipelineItem } from '@/src/lib/operations/moveOutAdminAction';
import { groupFailuresBySignature } from '@/src/lib/vacating/moveOutSettlementExplanation';
import { listAdminVacatingRequests } from '@/src/db/queries/admin';
import { getDepositSummaryForBooking } from '@/src/services/deposits';

function parseCompletedLimit(): number {
  const arg = process.argv.find((a) => a.startsWith('--completed-limit='));
  if (!arg) return 12;
  const n = Number(arg.split('=')[1]);
  return Number.isFinite(n) && n > 0 ? Math.min(50, n) : 12;
}

async function main() {
  const completedLimit = parseCompletedLimit();
  const vacatingRes = await listAdminVacatingRequests();
  if (!vacatingRes.ok) {
    console.error(vacatingRes.error);
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

  const completedRows = vacatingRes.data
    .filter((v) => v.status === 'completed')
    .sort((a, b) => String(b.resolvedAt ?? b.updatedAt).localeCompare(String(a.resolvedAt ?? a.updatedAt)))
    .slice(0, completedLimit);

  const results = [];
  const allFailures: Array<{ bookingCode: string; failures: { signature: string; message: string }[] }> =
    [];

  for (const item of activeItems) {
    const v = vacatingRes.data.find((r) => r.id === item.vacatingRequestId)!;
    const row = await validateMoveOutBillingRow(
      {
        bookingId: item.bookingId,
        bookingCode: item.bookingCode,
        customerFullName: item.customerFullName,
        vacatingRequestId: item.vacatingRequestId,
        vacatingStatus: item.vacatingStatus,
        noticeGivenDate: String(v.noticeGivenDate),
        vacatingDate: String(v.vacatingDate),
        monthlyRentPaiseSnapshot: v.monthlyRentPaiseSnapshot,
        stayType: v.stayType,
        durationMode: v.durationMode,
        deductionPaise: v.deductionPaise,
        pipelineItem: item,
      },
      'active',
    );
    results.push(row);
    if (!row.ok) allFailures.push({ bookingCode: row.bookingCode, failures: row.failures });
  }

  for (const v of completedRows) {
    const row = await validateMoveOutBillingRow(
      {
        bookingId: v.bookingId,
        bookingCode: v.bookingCode,
        customerFullName: v.customerFullName,
        vacatingRequestId: v.id,
        vacatingStatus: v.status,
        noticeGivenDate: String(v.noticeGivenDate),
        vacatingDate: String(v.vacatingDate),
        monthlyRentPaiseSnapshot: v.monthlyRentPaiseSnapshot,
        stayType: v.stayType,
        durationMode: v.durationMode,
        deductionPaise: v.deductionPaise,
        pipelineItem: null,
      },
      'completed',
    );
    results.push(row);
    if (!row.ok) allFailures.push({ bookingCode: row.bookingCode, failures: row.failures });
  }

  const passCount = results.filter((r) => r.ok).length;
  const grouped = groupFailuresBySignature(allFailures);

  const artifact = {
    generatedAt: new Date().toISOString(),
    completedLimit,
    summary: {
      total: results.length,
      pass: passCount,
      fail: results.length - passCount,
    },
    rows: results,
    failuresBySignature: Object.fromEntries(
      [...grouped.entries()].map(([sig, info]) => [sig, info]),
    ),
  };

  const outDir = join(process.cwd(), 'docs', 'validation');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    join(outDir, 'final-production-validation.json'),
    `${JSON.stringify(artifact, null, 2)}\n`,
    'utf8',
  );

  const lines: string[] = [
    '# Final production billing validation',
    '',
    `Generated: ${artifact.generatedAt}`,
    '',
    `- **Total rows:** ${results.length} (${activeItems.length} active + ${completedRows.length} completed samples)`,
    `- **Pass:** ${passCount}`,
    `- **Fail:** ${results.length - passCount}`,
    '',
    '## Results',
    '',
    '| Booking | Cohort | Workflow | Pipeline | Refund | OK | Signatures |',
    '|---------|--------|----------|----------|--------|----|------------|',
  ];

  for (const r of results) {
    lines.push(
      `| ${r.bookingCode} | ${r.cohort} | ${r.workflowStage} | ${r.pipelineStage} | ${r.refundTotalPaise ?? '—'} | ${r.ok ? 'PASS' : 'FAIL'} | ${r.signatures.join(', ') || '—'} |`,
    );
  }

  if (grouped.size > 0) {
    lines.push('', '## Failures by signature', '');
    for (const [sig, info] of [...grouped.entries()].sort((a, b) => b[1].count - a[1].count)) {
      lines.push(
        `### ${sig}`,
        '',
        `- Bookings: ${info.bookingCodes.join(', ')}`,
        `- Count: ${info.count}`,
        `- Sample: ${info.sample}`,
        '',
      );
    }
  }

  writeFileSync(join(outDir, 'FINAL_PRODUCTION_VALIDATION.md'), lines.join('\n'), 'utf8');

  console.log(`Wrote docs/validation/FINAL_PRODUCTION_VALIDATION.md`);
  console.log(`Pass ${passCount}/${results.length}`);

  await closeDb();
  process.exit(passCount === results.length ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
