'use server';

import { revalidatePath } from 'next/cache';
import { requireHairAuth } from '@/src/hair/lib/auth/guards';
import { createQuickCustomerFromForm } from '@/src/hair/actions/quickSaleCustomer';
import {
  buildInvoicePrintHtml,
  finalizeQuickSale,
  getInvoiceDetail,
  type PaymentSplitInput,
  type QuickSaleLineInput,
} from '@/src/hair/services/invoices';
import { previewQuickSaleTotals, searchCustomersForPos, searchStaffForPos } from '@/src/hair/services/quickSale';
import {
  listQuickSaleHolds,
  loadQuickSaleHold,
  saveQuickSaleHold,
} from '@/src/hair/services/quickSaleHold';
import type { QuickSalePosDraft } from '@/src/hair/db/schema/billing';

export type QuickSaleActionState = { error?: string; success?: string; invoiceId?: string };

export async function searchCustomersForPosAction(query: string) {
  await requireHairAuth();
  return searchCustomersForPos(query);
}

export async function searchStaffForPosAction(query: string) {
  await requireHairAuth();
  return searchStaffForPos(query);
}

/** @deprecated Prefer createQuickCustomerFromForm — kept for useActionState callers. */
export async function createQuickCustomerAction(
  _prev: QuickSaleActionState,
  formData: FormData,
): Promise<
  QuickSaleActionState & {
    customer?: { id: string; fullName: string; customerCode: string | null; phone: string };
  }
> {
  const res = await createQuickCustomerFromForm(formData);
  if (!res.ok) return { error: res.error };
  return { success: 'Customer created', customer: res.customer };
}

export async function previewQuickSaleTotalsAction(input: {
  customerId: string;
  cartLines: Array<{
    kind: QuickSaleLineInput['kind'];
    unitPricePaise: number;
    quantity: number;
    lineDiscountPaise: number;
    gstBps: number;
  }>;
  discountPaise?: number;
  walletRedeemPaise?: number;
  tipPaise?: number;
  roundOffPaise?: number;
}) {
  await requireHairAuth();
  return previewQuickSaleTotals(input.customerId, input.cartLines, input);
}

export async function completeQuickSaleAction(input: {
  customerId: string;
  lines: QuickSaleLineInput[];
  payments: PaymentSplitInput[];
  discountPaise?: number;
  walletRedeemPaise?: number;
  tipPaise?: number;
  roundOffPaise?: number;
  stylistId?: string | null;
  holdInvoiceId?: string | null;
}): Promise<QuickSaleActionState & { printHtml?: string }> {
  try {
    await requireHairAuth();
    const invoiceId = await finalizeQuickSale(input);
    revalidatePath('/billing');
    revalidatePath('/dashboard');
    revalidatePath('/quick-sale');
    const detail = await getInvoiceDetail(invoiceId);
    const printHtml = detail ? buildInvoicePrintHtml(detail) : undefined;
    return { success: 'Sale complete', invoiceId, printHtml };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not complete sale' };
  }
}

export async function listQuickSaleHoldsAction() {
  await requireHairAuth();
  return listQuickSaleHolds();
}

export async function loadQuickSaleHoldAction(invoiceId: string) {
  await requireHairAuth();
  return loadQuickSaleHold(invoiceId);
}

export async function holdQuickSaleAction(input: {
  customerId: string;
  lines: QuickSaleLineInput[];
  holdInvoiceId?: string | null;
  posDraft?: QuickSalePosDraft | null;
  discountPaise?: number;
  walletRedeemPaise?: number;
  tipPaise?: number;
  roundOffPaise?: number;
}): Promise<QuickSaleActionState & { holdInvoiceId?: string }> {
  try {
    await requireHairAuth();
    const holdInvoiceId = await saveQuickSaleHold(input);
    revalidatePath('/quick-sale');
    return { success: 'Bill held', holdInvoiceId };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not hold bill' };
  }
}
