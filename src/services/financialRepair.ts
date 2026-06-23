/**
 * Auto-repair for safe financial integrity issues.
 * Append-only deposit ledger — repairs never UPDATE/DELETE ledger rows.
 */

import { eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { auditLog, financialInvoices, invoiceAuditEvents } from '@/src/db/schema';
import type { InvoiceBreakdown } from '@/src/db/schema/financialInvoices';
import { formatDate } from '@/src/lib/dates';
import { nextFinancialInvoiceNumber } from '@/src/lib/billing/invoiceNumbering.server';
import {
  runFinancialIntegrityAudit,
  sumBreakdownLines,
  type FinancialIntegrityAuditReport,
  type FinancialIntegrityIssue,
} from '@/src/services/financialIntegrityAudit';
import { getResidentFinancialSummary } from '@/src/services/residentFinancialEngine';
import { createPaymentLinkForInvoice } from '@/src/services/unifiedInvoices';

export type RepairAction = {
  checkType: string;
  issue: FinancialIntegrityIssue;
  action: 'repaired' | 'skipped' | 'needs_manual_review';
  detail: string;
};

export type FinancialRepairResult = {
  dryRun: boolean;
  before: FinancialIntegrityAuditReport;
  after: FinancialIntegrityAuditReport | null;
  actions: RepairAction[];
  repairedCount: number;
  manualReviewCount: number;
};

async function logRepairAudit(
  entityId: string,
  action: string,
  diff: Record<string, unknown>,
): Promise<void> {
  await db.insert(auditLog).values({
    actorType: 'system',
    entity: 'financial_invoice',
    entityId,
    action,
    diff,
  });
}

async function repairInvoiceTotalMismatch(
  issue: FinancialIntegrityIssue,
  dryRun: boolean,
): Promise<RepairAction> {
  if (!issue.invoiceId) {
    return { checkType: issue.checkType, issue, action: 'skipped', detail: 'Missing invoiceId' };
  }
  const [inv] = await db
    .select()
    .from(financialInvoices)
    .where(eq(financialInvoices.id, issue.invoiceId))
    .limit(1);
  if (!inv) {
    return { checkType: issue.checkType, issue, action: 'skipped', detail: 'Invoice not found' };
  }
  const lineSum = sumBreakdownLines(inv.breakdown);
  if (lineSum === inv.amountPaise) {
    return { checkType: issue.checkType, issue, action: 'skipped', detail: 'Already aligned' };
  }

  if (dryRun) {
    return {
      checkType: issue.checkType,
      issue,
      action: 'repaired',
      detail: `Would set amountPaise ${inv.amountPaise} → ${lineSum}`,
    };
  }

  await db
    .update(financialInvoices)
    .set({ amountPaise: lineSum, updatedAt: new Date() })
    .where(eq(financialInvoices.id, issue.invoiceId));

  await db.insert(invoiceAuditEvents).values({
    invoiceId: issue.invoiceId,
    action: 'audit_repair_total_mismatch',
    actorType: 'system',
    diff: { previousAmountPaise: inv.amountPaise, newAmountPaise: lineSum },
  });
  await logRepairAudit(issue.invoiceId, 'invoice_total_mismatch_repaired', {
    previousAmountPaise: inv.amountPaise,
    newAmountPaise: lineSum,
  });

  return {
    checkType: issue.checkType,
    issue,
    action: 'repaired',
    detail: `Set amountPaise ${inv.amountPaise} → ${lineSum}`,
  };
}

async function repairPaymentNotReconciled(
  issue: FinancialIntegrityIssue,
  dryRun: boolean,
): Promise<RepairAction> {
  if (!issue.invoiceId) {
    return { checkType: issue.checkType, issue, action: 'skipped', detail: 'Missing invoiceId' };
  }
  const [inv] = await db
    .select()
    .from(financialInvoices)
    .where(eq(financialInvoices.id, issue.invoiceId))
    .limit(1);
  if (!inv) {
    return { checkType: issue.checkType, issue, action: 'skipped', detail: 'Invoice not found' };
  }

  const paidSoFar = inv.breakdown?.paidPaise ?? 0;
  const paymentAmount = issue.amountPaise ?? inv.amountPaise;
  const newPaid = Math.max(paidSoFar, paymentAmount);
  const newStatus = newPaid >= inv.amountPaise ? 'paid' : 'partial';

  if (dryRun) {
    return {
      checkType: issue.checkType,
      issue,
      action: 'repaired',
      detail: `Would set status ${inv.status} → ${newStatus}, paidPaise → ${newPaid}`,
    };
  }

  await db
    .update(financialInvoices)
    .set({
      status: newStatus,
      paidAt: newStatus === 'paid' ? new Date() : inv.paidAt,
      paymentId: issue.paymentId ?? inv.paymentId,
      breakdown: { ...(inv.breakdown ?? {}), paidPaise: newPaid },
      updatedAt: new Date(),
    })
    .where(eq(financialInvoices.id, issue.invoiceId));

  await db.insert(invoiceAuditEvents).values({
    invoiceId: issue.invoiceId,
    action: 'audit_repair_payment_reconciled',
    actorType: 'system',
    diff: { previousStatus: inv.status, newStatus, paymentId: issue.paymentId },
  });
  await logRepairAudit(issue.invoiceId, 'payment_reconciled', {
    previousStatus: inv.status,
    newStatus,
    paymentId: issue.paymentId,
  });

  return {
    checkType: issue.checkType,
    issue,
    action: 'repaired',
    detail: `Status ${inv.status} → ${newStatus}`,
  };
}

async function repairDepositShortfallNotInvoiced(
  issue: FinancialIntegrityIssue,
  dryRun: boolean,
): Promise<RepairAction> {
  const amountPaise = issue.amountPaise ?? 0;
  if (amountPaise <= 0) {
    return { checkType: issue.checkType, issue, action: 'skipped', detail: 'Zero shortfall' };
  }

  const summary = await getResidentFinancialSummary(issue.customerId);
  if (!summary?.pgId) {
    return { checkType: issue.checkType, issue, action: 'skipped', detail: 'No PG context' };
  }

  const label = 'Deposit shortfall (audit repair)';
  const breakdown: InvoiceBreakdown = {
    depositPaise: amountPaise,
    depositOutstandingPaise: amountPaise,
    lines: [{ kind: 'deposit', label, amountPaise }],
  };

  if (dryRun) {
    return {
      checkType: issue.checkType,
      issue,
      action: 'repaired',
      detail: `Would create deposit invoice for ₹${amountPaise / 100}`,
    };
  }

  const invoiceNumber = await nextFinancialInvoiceNumber({ pgId: summary.pgId });
  const [row] = await db
    .insert(financialInvoices)
    .values({
      invoiceNumber,
      invoiceType: 'deposit',
      customerId: issue.customerId,
      bookingId: issue.bookingId ?? summary.bookingId,
      pgId: summary.pgId,
      roomNumber: summary.roomNumber,
      amountPaise,
      breakdown,
      status: 'sent',
      dueDate: formatDate(new Date()),
      sentAt: new Date(),
      notes: `${label} — auto-created by financial audit repair`,
    })
    .returning({ id: financialInvoices.id });

  await db.insert(invoiceAuditEvents).values({
    invoiceId: row.id,
    action: 'audit_repair_deposit_shortfall',
    actorType: 'system',
    diff: { amountPaise, bookingId: issue.bookingId },
  });
  await logRepairAudit(row.id, 'deposit_shortfall_invoiced', {
    amountPaise,
    bookingId: issue.bookingId,
  });

  await createPaymentLinkForInvoice(row.id).catch(() => undefined);

  return {
    checkType: issue.checkType,
    issue,
    action: 'repaired',
    detail: `Created deposit invoice ${invoiceNumber} for ₹${amountPaise / 100}`,
  };
}

function manualReviewAction(issue: FinancialIntegrityIssue): RepairAction {
  return {
    checkType: issue.checkType,
    issue,
    action: 'needs_manual_review',
    detail: issue.detail,
  };
}

/** Run repairs for auto-repairable issues; flag manual-review types. */
export async function repairFinancialIssues(opts?: {
  dryRun?: boolean;
  report?: FinancialIntegrityAuditReport;
}): Promise<FinancialRepairResult> {
  const dryRun = opts?.dryRun ?? false;
  const before = opts?.report ?? (await runFinancialIntegrityAudit());
  const actions: RepairAction[] = [];
  const seen = new Set<string>();

  for (const issue of before.issues) {
    const key = `${issue.checkType}:${issue.invoiceId ?? issue.bookingId ?? issue.customerId}:${issue.detail}`;
    if (seen.has(key)) continue;
    seen.add(key);

    switch (issue.checkType) {
      case 'INVOICE_TOTAL_MISMATCH':
        actions.push(await repairInvoiceTotalMismatch(issue, dryRun));
        break;
      case 'PAYMENT_NOT_RECONCILED':
        actions.push(await repairPaymentNotReconciled(issue, dryRun));
        break;
      case 'DEPOSIT_SHORTFALL_NOT_INVOICED':
        actions.push(await repairDepositShortfallNotInvoiced(issue, dryRun));
        break;
      case 'DUPLICATE_INVOICE':
      case 'MISSING_RENT_INVOICE':
        actions.push(manualReviewAction(issue));
        break;
      default:
        if (!issue.autoRepairable) {
          actions.push(manualReviewAction(issue));
        }
        break;
    }
  }

  const repairedCount = actions.filter((a) => a.action === 'repaired').length;
  const manualReviewCount = actions.filter((a) => a.action === 'needs_manual_review').length;

  let after: FinancialIntegrityAuditReport | null = null;
  if (!dryRun && repairedCount > 0) {
    after = await runFinancialIntegrityAudit();
  }

  return { dryRun, before, after, actions, repairedCount, manualReviewCount };
}
