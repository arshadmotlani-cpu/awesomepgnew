/**
 * Daily financial reconciliation — audit, auto-repair safe issues, notify admins.
 */

import { randomUUID } from 'node:crypto';
import { db } from '@/src/db/client';
import { actionItems, auditLog } from '@/src/db/schema';
import { runFinancialIntegrityAudit } from '@/src/services/financialIntegrityAudit';
import { repairFinancialIssues } from '@/src/services/financialRepair';
import { getResidentFinancialSummary } from '@/src/services/residentFinancialEngine';

export type DailyReconciliationResult = {
  ok: true;
  asOf: string;
  issueCount: number;
  repairedCount: number;
  manualReviewCount: number;
  byCheckType: Record<string, number>;
};

const MANUAL_REVIEW_TYPES = new Set(['DUPLICATE_INVOICE', 'MISSING_RENT_INVOICE', 'DEPOSIT_LEDGER_NEGATIVE', 'OUTSTANDING_NOT_SURFACED', 'INVOICE_EMPTY']);

async function upsertManualReviewActionItems(
  issues: Awaited<ReturnType<typeof runFinancialIntegrityAudit>>['issues'],
): Promise<number> {
  let created = 0;
  for (const issue of issues) {
    if (!MANUAL_REVIEW_TYPES.has(issue.checkType) && issue.autoRepairable) continue;

    const summary = await getResidentFinancialSummary(issue.customerId);
    const pgId = summary?.pgId;
    if (!pgId) continue;

    const sourceKey = `financial_audit:${issue.checkType}:${issue.invoiceId ?? issue.bookingId ?? issue.customerId}`;
    await db
      .insert(actionItems)
      .values({
        type: 'financial_audit_review',
        title: `Financial audit · ${issue.checkType.replace(/_/g, ' ')} · ${issue.customerName}`,
        pgId,
        residentId: issue.customerId,
        amount: issue.amountPaise ?? null,
        priority: 'high',
        sourceKey,
        metadata: {
          checkType: issue.checkType,
          detail: issue.detail,
          invoiceId: issue.invoiceId,
          bookingId: issue.bookingId,
        },
        status: 'open',
        updatedAt: new Date(),
      })
      .onConflictDoNothing();

    created += 1;
  }
  return created;
}

/** Run daily reconciliation job — audit, repair, log, action items. */
export async function runDailyFinancialReconciliation(): Promise<DailyReconciliationResult> {
  const auditBefore = await runFinancialIntegrityAudit();
  const repair = await repairFinancialIssues({ dryRun: false, report: auditBefore });
  const auditAfter = repair.after ?? auditBefore;

  await db.insert(auditLog).values({
    actorType: 'system',
    entity: 'financial_reconciliation',
    entityId: randomUUID(),
    action: 'daily_reconciliation',
    diff: {
      issueCount: auditAfter.summary.issueCount,
      repairedCount: repair.repairedCount,
      manualReviewCount: repair.manualReviewCount,
      byCheckType: auditAfter.summary.byCheckType,
      beforeIssueCount: auditBefore.summary.issueCount,
    },
  });

  const manualIssues = auditAfter.issues.filter(
    (i) => MANUAL_REVIEW_TYPES.has(i.checkType) || !i.autoRepairable,
  );
  await upsertManualReviewActionItems(manualIssues);

  return {
    ok: true,
    asOf: auditAfter.asOf,
    issueCount: auditAfter.summary.issueCount,
    repairedCount: repair.repairedCount,
    manualReviewCount: repair.manualReviewCount,
    byCheckType: auditAfter.summary.byCheckType,
  };
}
