/**
 * Repair actions for billing integrity issues (safe classes only).
 */
import { eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { auditLog, electricityInvoices, invoiceAuditEvents, rentInvoices } from '@/src/db/schema';
import {
  runBillingIntegrityCheck,
  type BillingIntegrityAuditReport,
  type BillingIntegrityIssue,
} from '@/src/services/billingIntegrityCheck';
import {
  syncElectricityInvoiceToUnifiedInTx,
  syncRentInvoiceToUnifiedInTx,
} from '@/src/lib/billing/syncUnifiedInvoiceInTx';

export type BillingRepairAction = {
  checkType: string;
  issue: BillingIntegrityIssue;
  action: 'repaired' | 'skipped' | 'needs_manual_review';
  detail: string;
};

export type BillingRepairResult = {
  dryRun: boolean;
  before: BillingIntegrityAuditReport;
  after: BillingIntegrityAuditReport | null;
  actions: BillingRepairAction[];
  repairedCount: number;
  manualReviewCount: number;
};

async function logRepair(entityId: string, action: string, diff: Record<string, unknown>) {
  await db.insert(auditLog).values({
    actorType: 'system',
    entity: 'billing_integrity',
    entityId,
    action,
    diff,
  });
}

async function repairApprovedPaymentInvoiceDue(
  issue: BillingIntegrityIssue,
  dryRun: boolean,
): Promise<BillingRepairAction> {
  if (!issue.sourceInvoiceId || !issue.sourceTable || !issue.paymentId) {
    return { checkType: issue.checkType, issue, action: 'skipped', detail: 'Missing ids' };
  }

  if (dryRun) {
    return {
      checkType: issue.checkType,
      issue,
      action: 'repaired',
      detail: `Would mark ${issue.sourceTable} ${issue.sourceInvoiceId} paid with payment ${issue.paymentId}`,
    };
  }

  if (issue.sourceTable === 'rent_invoices') {
    await db
      .update(rentInvoices)
      .set({
        status: 'paid',
        paymentId: issue.paymentId,
        paidAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(rentInvoices.id, issue.sourceInvoiceId));

    await db.transaction(async (tx) => {
      await syncRentInvoiceToUnifiedInTx(tx, issue.sourceInvoiceId!);
    });
  } else if (issue.sourceTable === 'electricity_invoices') {
    await db
      .update(electricityInvoices)
      .set({
        status: 'paid',
        paymentId: issue.paymentId,
        paidAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(electricityInvoices.id, issue.sourceInvoiceId));

    await db.transaction(async (tx) => {
      await syncElectricityInvoiceToUnifiedInTx(tx, issue.sourceInvoiceId!);
    });
  } else {
    return { checkType: issue.checkType, issue, action: 'skipped', detail: 'Unknown source table' };
  }

  await logRepair(issue.sourceInvoiceId, 'repair_approved_payment_invoice_due', {
    paymentId: issue.paymentId,
    sourceTable: issue.sourceTable,
  });

  return {
    checkType: issue.checkType,
    issue,
    action: 'repaired',
    detail: `Marked ${issue.sourceTable} paid and synced mirror`,
  };
}

async function repairSourceMirrorMismatch(
  issue: BillingIntegrityIssue,
  dryRun: boolean,
): Promise<BillingRepairAction> {
  if (!issue.sourceInvoiceId || !issue.sourceTable) {
    return { checkType: issue.checkType, issue, action: 'skipped', detail: 'Missing source ids' };
  }

  if (dryRun) {
    return {
      checkType: issue.checkType,
      issue,
      action: 'repaired',
      detail: `Would resync mirror from ${issue.sourceTable} ${issue.sourceInvoiceId}`,
    };
  }

  await db.transaction(async (tx) => {
    if (issue.sourceTable === 'rent_invoices') {
      await syncRentInvoiceToUnifiedInTx(tx, issue.sourceInvoiceId!);
    } else if (issue.sourceTable === 'electricity_invoices') {
      await syncElectricityInvoiceToUnifiedInTx(tx, issue.sourceInvoiceId!);
    }
  });

  if (issue.unifiedInvoiceId) {
    await db.insert(invoiceAuditEvents).values({
      invoiceId: issue.unifiedInvoiceId,
      action: 'billing_integrity_mirror_resync',
      actorType: 'system',
      diff: { sourceTable: issue.sourceTable, sourceInvoiceId: issue.sourceInvoiceId },
    });
  }

  await logRepair(issue.sourceInvoiceId, 'repair_source_mirror_mismatch', {
    unifiedInvoiceId: issue.unifiedInvoiceId,
  });

  return {
    checkType: issue.checkType,
    issue,
    action: 'repaired',
    detail: 'Resynced financial_invoices from source invoice',
  };
}

export async function repairBillingIntegrityIssue(
  issue: BillingIntegrityIssue,
  opts?: { dryRun?: boolean },
): Promise<BillingRepairAction> {
  const dryRun = opts?.dryRun ?? false;

  switch (issue.checkType) {
    case 'APPROVED_PAYMENT_INVOICE_DUE':
      return repairApprovedPaymentInvoiceDue(issue, dryRun);
    case 'SOURCE_MIRROR_MISMATCH':
      return repairSourceMirrorMismatch(issue, dryRun);
    default:
      return {
        checkType: issue.checkType,
        issue,
        action: 'needs_manual_review',
        detail: 'No automated repair for this issue class',
      };
  }
}

export async function repairBillingIntegrityIssues(opts?: {
  dryRun?: boolean;
  billingMonth?: string;
  report?: BillingIntegrityAuditReport;
}): Promise<BillingRepairResult> {
  const dryRun = opts?.dryRun ?? false;
  const before = opts?.report ?? (await runBillingIntegrityCheck(opts?.billingMonth));

  const actions: BillingRepairAction[] = [];
  for (const issue of before.issues) {
    if (!issue.autoRepairable) {
      actions.push({
        checkType: issue.checkType,
        issue,
        action: 'needs_manual_review',
        detail: 'Not auto-repairable',
      });
      continue;
    }
    const result = await repairBillingIntegrityIssue(issue, { dryRun });
    actions.push(result);
  }

  const repairedCount = actions.filter((a) => a.action === 'repaired').length;
  const manualReviewCount = actions.filter((a) => a.action === 'needs_manual_review').length;
  const after = dryRun ? null : await runBillingIntegrityCheck(opts?.billingMonth ?? before.billingMonth);

  return { dryRun, before, after, actions, repairedCount, manualReviewCount };
}
