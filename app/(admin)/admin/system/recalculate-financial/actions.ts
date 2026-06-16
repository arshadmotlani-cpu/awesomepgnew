'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminSession } from '@/src/lib/auth/guards';
import { recalculateAllFinancialSummaries } from '@/src/services/financialAudit';

export type RecalcActionState =
  | { status: 'idle' }
  | { status: 'ok'; message: string; detail?: string }
  | { status: 'error'; message: string };

export async function runFinancialRecalcAction(
  _prev: RecalcActionState,
  formData: FormData,
): Promise<RecalcActionState> {
  const session = await requireAdminSession('/admin/system/recalculate-financial');
  const billingMonth = String(formData.get('billingMonth') ?? '').trim() || undefined;

  try {
    const result = await recalculateAllFinancialSummaries({ billingMonth, session });
    revalidatePath('/admin/overview');
    revalidatePath('/admin/revenue');
    revalidatePath('/admin/collections');
    revalidatePath('/admin/deposits');
    revalidatePath('/admin/system/financial-audit');
    revalidatePath('/admin/residents');

    const detail = [
      `Rent unified synced: ${result.reconcile.rentUnifiedSynced}`,
      `Electricity unified synced: ${result.reconcile.elecUnifiedSynced}`,
      `Financial rows cancelled: ${result.reconcile.financialRowsCancelled}`,
      `Financial rows fixed: ${result.reconcile.financialRowsFixed}`,
      `Deposits marked overdue: ${result.depositsMarkedOverdue}`,
      `Engine grand outstanding: ₹${(result.engineTotals.totals.outstandingPaise / 100).toLocaleString('en-IN')}`,
    ].join(' · ');

    return { status: 'ok', message: 'Financial data recalculated.', detail };
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Recalculation failed.',
    };
  }
}
