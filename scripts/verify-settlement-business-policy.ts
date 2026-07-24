#!/usr/bin/env npx tsx
/**
 * Business policy spot-checks — math + objective policy tags per profile.
 *
 *   USE_PRODUCTION_DB=1 npx tsx scripts/verify-settlement-business-policy.ts
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('verify-settlement-business-policy.ts');

import { closeDb } from '@/src/db/client';
import {
  buildBillingCoverageModel,
  rawPeriodFromInvoiceDueDate,
} from '@/src/lib/billing/billingCoverageModel';
import { validateMoveOutBillingRow } from '@/src/lib/billing/moveOutBillingEngineAudit';
import {
  buildMoveOutSettlementExplanations,
} from '@/src/lib/vacating/moveOutSettlementExplanation';
import {
  buildVacatingSettlementPreviewSections,
  computeVacatingSettlementWaterfallFromContext,
} from '@/src/lib/vacating/computeVacatingSettlementPreview';
import { noticeDisplayFromBillingCoverage } from '@/src/lib/vacating/loadVacatingBillingPresentation';
import { ESTIMATED_REFUND_DISCLAIMER } from '@/src/lib/checkout/settlementDisplayFormat';
import { diffDays } from '@/src/lib/dates';
import { listAdminVacatingRequests } from '@/src/db/queries/admin';
import { validateBillingEngineSettlement } from '@/src/lib/billing/billingEngineValidation';

type Profile = {
  bookingCode: string;
  residentLabel: string;
  policyTags: string[];
  syntheticVacatingDate?: string;
  objective?: Record<string, unknown>;
};

async function syntheticPresentation(vacatingDate: string) {
  const moveInJul7 = '2026-07-07';
  const monthly387k = 387_000;
  const paidJul7Aug6 = rawPeriodFromInvoiceDueDate('2026-07-07', 7, moveInJul7);
  const coverage = buildBillingCoverageModel({
    bookingId: 'bk-synthetic',
    moveInDate: moveInJul7,
    billingDay: 7,
    rawPaidPeriods: [paidJul7Aug6],
    vacatingDate,
    noticeGivenDate: '2026-07-01',
    monthlyRentPaise: monthly387k,
    treatAsApprovedForTail: true,
    noticeApplies: true,
  });
  const ctx = {
    checkInDate: moveInJul7,
    vacatingDate,
    rentPaidPaise: 412_100,
    depositHeldPaise: 412_100,
    monthlyRentPaise: monthly387k,
    missingNoticeDays: coverage.noticeBreakdown?.missingNoticeDays ?? 0,
    noticeApplies: true,
    checkoutTailRentPaise: coverage.tailRentPaise,
  };
  const waterfall = computeVacatingSettlementWaterfallFromContext(ctx);
  const noticeDisplay = noticeDisplayFromBillingCoverage(coverage);
  const noticeGivenDays = Math.max(0, diffDays('2026-07-01', vacatingDate));
  const { sections, auditTrace, depositHeldPaise } = buildVacatingSettlementPreviewSections({
    notice: noticeDisplay,
    vacatingDate,
    noticeGivenDate: '2026-07-01',
    noticeGivenDays,
    waterfall,
    coverage,
    depositHeldPaise: ctx.depositHeldPaise,
    mode: 'estimate',
  });
  return {
    coverage,
    noticeDisplay,
    ctx,
    waterfall,
    estimatedSettlement: {
      sections,
      auditTrace,
      waterfall,
      estimatedRefundPaise: waterfall.refund.totalPaise,
      estimatedUnusedRentCreditPaise: waterfall.refund.unusedRentPortionPaise,
      estimatedRefundableDepositPaise: waterfall.depositBucket.refundablePaise,
      depositHeldPaise,
      disclaimer: ESTIMATED_REFUND_DISCLAIMER,
      mode: 'estimate' as const,
    },
    billingCoverageDaysPaid: { label: '—', value: '—' },
  };
}

function checkObjective(
  objective: Record<string, unknown> | undefined,
  coverage: { tailRentPaise: number; finalInvoiceSuppression: boolean },
): string[] {
  if (!objective) return [];
  const errs: string[] = [];
  if (objective.tailRentPaise === 0 && coverage.tailRentPaise !== 0) {
    errs.push(`expected tail 0 got ${coverage.tailRentPaise}`);
  }
  if (typeof objective.tailRentPaiseMin === 'number' && coverage.tailRentPaise < objective.tailRentPaiseMin) {
    errs.push(`tail below min ${objective.tailRentPaiseMin}`);
  }
  if (objective.finalInvoiceSuppression === false && coverage.finalInvoiceSuppression) {
    errs.push('expected no invoice suppression');
  }
  if (objective.finalInvoiceSuppressionWhenTailPositive && coverage.tailRentPaise > 0 && !coverage.finalInvoiceSuppression) {
    errs.push('expected suppression when tail > 0');
  }
  return errs;
}

async function main() {
  const fixturePath = join(process.cwd(), 'scripts', 'fixtures', 'settlement-policy-profiles.json');
  const { profiles } = JSON.parse(readFileSync(fixturePath, 'utf8')) as { profiles: Profile[] };

  const vacatingRes = await listAdminVacatingRequests();
  if (!vacatingRes.ok) {
    console.error(vacatingRes.error);
    process.exit(2);
  }

  const dossiers: string[] = [
    '# Settlement business policy spot-checks',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
  ];

  let policyFails = 0;

  for (const profile of profiles) {
    dossiers.push(`## ${profile.bookingCode} — ${profile.residentLabel}`, '', `Tags: ${profile.policyTags.join(', ')}`, '');

    if (profile.syntheticVacatingDate) {
      const presentation = await syntheticPresentation(profile.syntheticVacatingDate);
      const report = buildMoveOutSettlementExplanations(presentation, {
        bookingId: 'bk-synthetic',
        bookingCode: profile.bookingCode,
        residentName: profile.residentLabel,
      });
      const validation = validateBillingEngineSettlement(report, presentation);
      const policyErrs = checkObjective(profile.objective, presentation.coverage);
      dossiers.push(`- Engine validation: ${validation.ok ? 'PASS' : 'FAIL'}`);
      if (!validation.ok) {
        policyFails += 1;
        dossiers.push(`- Signatures: ${validation.failures.map((f) => f.signature).join(', ')}`);
      }
      if (policyErrs.length) {
        policyFails += 1;
        dossiers.push(`- Policy objective: FAIL — ${policyErrs.join('; ')}`);
      } else {
        dossiers.push('- Policy objective: PASS');
      }
      dossiers.push('', '### Explanation summary', '');
      for (const line of report.lines) {
        dossiers.push(
          `- **${line.label}:** ${line.valueDisplay} — ${line.businessRuleId}`,
          `  - Formula: ${line.formula}`,
          `  - Reason: ${line.reasonLines.join(' ') || '—'}`,
        );
      }
      dossiers.push('');
      continue;
    }

    const row = vacatingRes.data.find((v) => v.bookingCode === profile.bookingCode);
    if (!row) {
      dossiers.push('- **SKIP:** booking not found in vacating list (may be completed/archived elsewhere)', '');
      continue;
    }

    const result = await validateMoveOutBillingRow(
      {
        bookingId: row.bookingId,
        bookingCode: row.bookingCode,
        customerFullName: row.customerFullName,
        vacatingRequestId: row.id,
        vacatingStatus: row.status,
        noticeGivenDate: String(row.noticeGivenDate),
        vacatingDate: String(row.vacatingDate),
        monthlyRentPaiseSnapshot: row.monthlyRentPaiseSnapshot,
        stayType: row.stayType,
        durationMode: row.durationMode,
        deductionPaise: row.deductionPaise,
        pipelineItem: null,
      },
      row.status === 'completed' ? 'completed' : 'active',
    );

    dossiers.push(`- Engine validation: ${result.ok ? 'PASS' : 'FAIL'}`);
    if (!result.ok) {
      policyFails += 1;
      dossiers.push(`- Signatures: ${result.signatures.join(', ')}`);
    }
    dossiers.push(`- Refund total (paise): ${result.refundTotalPaise ?? '—'}`, '');
  }

  dossiers.push('## Owner review', '', 'Subjective policy (notice prepaid display vs charge) — confirm in UI matches BR-NOTICE-PREPAID.', '');

  const outPath = join(process.cwd(), 'docs', 'validation', 'POLICY_SPOTCHECKS.md');
  mkdirSync(join(process.cwd(), 'docs', 'validation'), { recursive: true });
  writeFileSync(outPath, dossiers.join('\n'), 'utf8');
  console.log(`Wrote ${outPath}`);

  await closeDb();
  process.exit(policyFails > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
