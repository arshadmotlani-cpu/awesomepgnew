#!/usr/bin/env npx tsx
/**
 * Phase 0 — read-only move-out validation matrix for all active non-terminal rows.
 * Does NOT modify billing engine code or database.
 *
 *   USE_PRODUCTION_DB=1 npx tsx scripts/report-phase0-moveout-validation-matrix.ts
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('report-phase0-moveout-validation-matrix.ts');

import { closeDb } from '@/src/db/client';
import { guardDepositPaise } from '@/src/lib/deposits/paiseSafety';
import { buildMoveOutPipeline } from '@/src/lib/moveOut/moveOutPipeline';
import { deriveMoveOutWorkflowStage } from '@/src/lib/moveOut/moveOutWorkflowStages';
import { isTerminalVacatingPipelineItem } from '@/src/lib/operations/moveOutAdminAction';
import { clampPaidInvoiceCoverage } from '@/src/lib/billing/billingCoverageModel';
import { assertCheckoutSettlementWaterfallConsistent } from '@/src/lib/checkout/settlementInvariants';
import { loadVacatingBillingPresentation } from '@/src/lib/vacating/loadVacatingBillingPresentation';
import {
  buildMoveOutSettlementExplanations,
  groupFailuresBySignature,
  validateMoveOutSettlementExplanations,
} from '@/src/lib/vacating/moveOutSettlementExplanation';
import { listAdminVacatingRequests } from '@/src/db/queries/admin';
import { getDepositSummaryForBooking } from '@/src/services/deposits';

type RowResult = {
  bookingCode: string;
  vacatingRequestId: string;
  workflowStage: string;
  vacatingStatus: string;
  settlementStatus: string | null;
  pipelineStage: string;
  explainabilityOk: boolean;
  invC1Ok: boolean;
  invC3Ok: boolean;
  signatures: string[];
};

async function main() {
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

  const active = pipeline.filter(
    (item) =>
      !isTerminalVacatingPipelineItem({
        stage: item.stage,
        vacatingStatus: item.vacatingStatus,
        settlementStatus: item.settlementStatus,
      }),
  );

  const results: RowResult[] = [];
  const allFailures: Array<{ bookingCode: string; failures: { signature: string }[] }> = [];

  for (const item of active) {
    const v = vacatingRes.data.find((r) => r.id === item.vacatingRequestId)!;
    const workflow = deriveMoveOutWorkflowStage(item);
    const signatures: string[] = [];

    let explainabilityOk = false;
    let invC1Ok = true;
    let invC3Ok = true;

    try {
      const presentation = await loadVacatingBillingPresentation({
        bookingId: item.bookingId,
        noticeGivenDate: String(v.noticeGivenDate),
        vacatingDate: String(v.vacatingDate),
        monthlyRentPaiseSnapshot: v.monthlyRentPaiseSnapshot,
        stayType: v.stayType,
        durationMode: v.durationMode,
        mode: 'estimate',
        treatAsApprovedForTail: true,
      });

      if (!presentation) {
        signatures.push('PRESENTATION_LOAD_FAILED');
      } else {
        try {
          assertCheckoutSettlementWaterfallConsistent(presentation.waterfall);
        } catch {
          signatures.push('WATERFALL_INCONSISTENT');
        }

        const clamped = clampPaidInvoiceCoverage(
          presentation.coverage.paidInvoiceCoverage,
          presentation.coverage.moveInDate,
        );
        invC1Ok = clamped.every((p) => p.periodStart >= presentation.coverage.moveInDate);
        if (!invC1Ok) signatures.push('COVERAGE_BEFORE_MOVEIN');

        const vac = presentation.coverage.vacatingDate;
        if (vac && presentation.coverage.tailRentPaise > 0) {
          const insidePaid = presentation.coverage.paidInvoiceCoverage.some(
            (p) => p.periodStart <= vac && vac <= p.periodEnd,
          );
          if (insidePaid) {
            invC3Ok = false;
            signatures.push('TAIL_IN_PAID_PERIOD');
          }
        }

        const report = buildMoveOutSettlementExplanations(presentation, {
          bookingId: item.bookingId,
          bookingCode: item.bookingCode,
          residentName: item.customerFullName,
          vacatingRequestId: item.vacatingRequestId,
        });
        const validation = validateMoveOutSettlementExplanations(report, presentation, {
          storedNoticeDeductionPaise:
            item.vacatingStatus === 'pending' ? v.deductionPaise : null,
        });
        explainabilityOk = validation.ok;
        if (!validation.ok) {
          for (const f of validation.failures) {
            if (!signatures.includes(f.signature)) signatures.push(f.signature);
          }
          allFailures.push({ bookingCode: item.bookingCode, failures: validation.failures });
        }
      }
    } catch {
      signatures.push('PRESENTATION_EXCEPTION');
    }

    results.push({
      bookingCode: item.bookingCode,
      vacatingRequestId: item.vacatingRequestId,
      workflowStage: workflow.id,
      vacatingStatus: item.vacatingStatus,
      settlementStatus: item.settlementStatus,
      pipelineStage: item.stage,
      explainabilityOk,
      invC1Ok,
      invC3Ok,
      signatures,
    });
  }

  const passCount = results.filter(
    (r) => r.explainabilityOk && r.invC1Ok && r.invC3Ok && r.signatures.length === 0,
  ).length;

  const grouped = groupFailuresBySignature(allFailures);

  const lines: string[] = [
    '# Active move-out — Phase 0 validation matrix',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    'Read-only audit. See [BILLING_ENGINE_INVARIANTS.md](../BILLING_ENGINE_INVARIANTS.md).',
    '',
    '## Summary',
    '',
    `- Active non-terminal rows: **${results.length}**`,
    `- Full pass (automated checks below): **${passCount}**`,
    `- Rows with any signature: **${results.length - passCount}**`,
    '',
    '### Workflow stage counts',
    '',
  ];

  const stageCounts = new Map<string, number>();
  for (const r of results) {
    stageCounts.set(r.workflowStage, (stageCounts.get(r.workflowStage) ?? 0) + 1);
  }
  for (const [stage, n] of [...stageCounts.entries()].sort()) {
    lines.push(`- \`${stage}\`: ${n}`);
  }

  lines.push('', '## Per resident', '', '| Booking | Workflow | Vacating | Settlement | Pipeline stage | E1–E3 | INV-C1 | INV-C3 | Signatures |', '|---------|----------|----------|------------|----------------|-------|--------|--------|------------|');

  for (const r of results) {
    lines.push(
      `| ${r.bookingCode} | ${r.workflowStage} | ${r.vacatingStatus} | ${r.settlementStatus ?? '—'} | ${r.pipelineStage} | ${r.explainabilityOk ? 'PASS' : 'FAIL'} | ${r.invC1Ok ? 'PASS' : 'FAIL'} | ${r.invC3Ok ? 'PASS' : 'N/A'} | ${r.signatures.join(', ') || '—'} |`,
    );
  }

  if (grouped.size > 0) {
    lines.push('', '## Failures by signature', '');
    for (const [sig, info] of [...grouped.entries()].sort((a, b) => b[1].count - a[1].count)) {
      lines.push(`### ${sig}`, '', `- Occurrences: ${info.count}`, `- Bookings: ${info.bookingCodes.join(', ')}`, `- Sample: ${info.sample}`, '');
    }
  }

  lines.push(
    '',
    '## Not yet automated (Phase 0 manual N/A)',
    '',
    '- **INV-X1** — locked checkout waterfall vs presentation (settlement_review / refund_ready)',
    '- **INV-C4** — tail overlap with paid coverage days',
    '- **INV-E4** — zero amounts require explicit reason text',
    '- **INV-N1/N2/P1** — explicit asserts (partially implied by V2)',
    '',
  );

  const outDir = join(process.cwd(), 'docs', 'validation');
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, 'ACTIVE_MOVEOUT_PHASE0_MATRIX.md');
  writeFileSync(outPath, lines.join('\n'), 'utf8');

  console.log(`Wrote ${outPath}`);
  console.log(`Summary: ${passCount}/${results.length} full pass`);

  await closeDb();
  process.exit(passCount === results.length ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
