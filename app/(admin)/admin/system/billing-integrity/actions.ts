'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminSession } from '@/src/lib/auth/guards';
import { resolveBillingMonth } from '@/src/lib/dateDefaults';
import { runBillingIntegrityCheck } from '@/src/services/billingIntegrityCheck';
import {
  repairBillingIntegrityIssue,
  repairBillingIntegrityIssues,
  type BillingRepairResult,
} from '@/src/services/billingIntegrityRepair';
import type { BillingIntegrityIssue } from '@/src/services/billingIntegrityCheck';

export async function loadBillingIntegrityReport(billingMonth?: string) {
  await requireAdminSession('/admin/system/billing-integrity');
  const month = resolveBillingMonth(billingMonth);
  return runBillingIntegrityCheck(month);
}

export async function repairBillingIssueAction(formData: FormData) {
  await requireAdminSession('/admin/system/billing-integrity');

  const issue: BillingIntegrityIssue = {
    checkType: String(formData.get('checkType') ?? '') as BillingIntegrityIssue['checkType'],
    customerId: String(formData.get('customerId') ?? ''),
    customerName: String(formData.get('customerName') ?? ''),
    bookingId: String(formData.get('bookingId') ?? '') || undefined,
    invoiceId: String(formData.get('invoiceId') ?? '') || undefined,
    sourceInvoiceId: String(formData.get('sourceInvoiceId') ?? '') || undefined,
    sourceTable: String(formData.get('sourceTable') ?? '') || undefined,
    unifiedInvoiceId: String(formData.get('unifiedInvoiceId') ?? '') || undefined,
    paymentId: String(formData.get('paymentId') ?? '') || undefined,
    roomId: String(formData.get('roomId') ?? '') || undefined,
    roomNumber: String(formData.get('roomNumber') ?? '') || undefined,
    billingMonth: String(formData.get('billingMonth') ?? '') || undefined,
    detail: String(formData.get('detail') ?? ''),
    autoRepairable: formData.get('autoRepairable') === 'true',
  };

  const result = await repairBillingIntegrityIssue(issue, { dryRun: false });

  revalidatePath('/admin/system/billing-integrity');
  revalidatePath('/admin/payments');
  revalidatePath('/admin/operations');
  return result;
}

export async function repairAllBillingIssuesAction(billingMonth?: string): Promise<BillingRepairResult> {
  await requireAdminSession('/admin/system/billing-integrity');
  const month = resolveBillingMonth(billingMonth);
  const result = await repairBillingIntegrityIssues({ dryRun: false, billingMonth: month });

  revalidatePath('/admin/system/billing-integrity');
  revalidatePath('/admin/payments');
  revalidatePath('/admin/operations');
  return result;
}
