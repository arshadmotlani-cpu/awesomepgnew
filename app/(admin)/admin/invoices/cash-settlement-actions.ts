'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminSession } from '@/src/lib/auth/guards';
import {
  getCashSettlementEligibility,
  markFinancialInvoicePaidWithCash,
} from '@/src/services/adminCashSettlement';

export type CashSettlementActionState =
  | { status: 'idle' }
  | { status: 'ok'; message: string }
  | { status: 'error'; message: string };

export async function markInvoicePaidWithCashAction(
  _prev: CashSettlementActionState,
  formData: FormData,
): Promise<CashSettlementActionState> {
  const session = await requireAdminSession('/admin/billing');
  const financialInvoiceId = String(formData.get('financialInvoiceId') ?? '').trim();
  const notes = String(formData.get('notes') ?? '').trim();

  if (!financialInvoiceId) {
    return { status: 'error', message: 'Missing invoice.' };
  }

  const result = await markFinancialInvoicePaidWithCash(session, {
    financialInvoiceId,
    notes: notes || undefined,
  });

  if (!result.ok) {
    return { status: 'error', message: result.error };
  }

  revalidatePath('/admin/invoices');
  revalidatePath(`/admin/invoices/${financialInvoiceId}`);
  revalidatePath('/admin/billing');
  revalidatePath('/admin/operations');

  return {
    status: 'ok',
    message: 'Invoice marked paid (cash). Balances and queues updated.',
  };
}

export async function loadCashSettlementEligibilityAction(financialInvoiceId: string) {
  const session = await requireAdminSession('/admin/billing');
  return getCashSettlementEligibility(session, financialInvoiceId);
}
