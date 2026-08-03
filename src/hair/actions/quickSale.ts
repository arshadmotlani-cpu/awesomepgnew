'use server';

import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/src/hair/lib/auth/permissions';
import { createQuickCustomerFromForm } from '@/src/hair/actions/quickSaleCustomer';
import type { Basket } from '@/src/hair/domain/basket/types';
import { enrichBasketWithRedemptions, checkoutFromBasket } from '@/src/hair/domain/checkout/pipeline';
import { getInvoiceDetail } from '@/src/hair/services/invoices';
import type { QuickSaleLineInput } from '@/src/hair/services/invoices';
import { previewQuickSaleTotals, searchCustomersForPos, searchStaffForPos } from '@/src/hair/services/quickSale';
import {
  listQuickSaleHolds,
  loadQuickSaleHold,
  saveQuickSaleHold,
} from '@/src/hair/services/quickSaleHold';
import type { QuickSalePosDraft } from '@/src/hair/db/schema/billing';

export type QuickSaleActionState = { error?: string; success?: string; invoiceId?: string };

export async function searchCustomersForPosAction(query: string) {
  await requirePermission('page:quick_sale');
  return searchCustomersForPos(query);
}

export async function searchStaffForPosAction(query: string) {
  await requirePermission('page:quick_sale');
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
  await requirePermission('page:quick_sale');
  return previewQuickSaleTotals(input.customerId, input.cartLines, input);
}

export async function completeQuickSaleAction(input: {
  basket: Basket;
  holdInvoiceId?: string | null;
  source?: 'quick_sale' | 'appointment';
  appointmentId?: string;
}): Promise<
  QuickSaleActionState & { printHtml?: string; advancePaise?: number; invoiceNumber?: string }
> {
  try {
    await requirePermission('action:billing.checkout');
    const enriched = await enrichBasketWithRedemptions(input.basket);
    const result = await checkoutFromBasket({
      basket: enriched,
      holdInvoiceId: input.holdInvoiceId,
      source: input.source,
      appointmentId: input.appointmentId,
    });
    revalidatePath('/billing');
    revalidatePath('/dashboard/revenue');
    revalidatePath('/quick-sale');
    if (input.source === 'appointment' || input.appointmentId) {
      revalidatePath('/appointments');
    }
    const detail = await getInvoiceDetail(result.invoiceId);
    const { buildInvoicePrintHtml } = await import('@/src/hair/services/invoices');
    const printHtml = detail ? buildInvoicePrintHtml(detail) : undefined;
    return {
      success: 'Sale complete',
      invoiceId: result.invoiceId,
      invoiceNumber: detail?.invoice.invoiceNumber,
      printHtml,
      advancePaise: result.advancePaise,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not complete sale' };
  }
}

/** @deprecated Use completeQuickSaleAction with basket */
export async function completeQuickSaleLegacyAction(input: {
  customerId: string;
  lines: import('@/src/hair/services/invoices').QuickSaleLineInput[];
  payments: import('@/src/hair/services/invoices').PaymentSplitInput[];
  discountPaise?: number;
  walletRedeemPaise?: number;
  tipPaise?: number;
  roundOffPaise?: number;
  stylistId?: string | null;
  holdInvoiceId?: string | null;
  markDue?: boolean;
  markFullDue?: boolean;
  creditOverpayAsAdvance?: boolean;
}): Promise<QuickSaleActionState & { printHtml?: string }> {
  const { finalizeQuickSale, getInvoiceDetail, buildInvoicePrintHtml } = await import(
    '@/src/hair/services/invoices'
  );
  try {
    await requirePermission('action:billing.checkout');
    const invoiceId = await finalizeQuickSale(input);
    revalidatePath('/billing');
    revalidatePath('/dashboard/revenue');
    revalidatePath('/quick-sale');
    const detail = await getInvoiceDetail(invoiceId);
    const printHtml = detail ? buildInvoicePrintHtml(detail) : undefined;
    return { success: 'Sale complete', invoiceId, printHtml };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not complete sale' };
  }
}

export async function listQuickSaleHoldsAction() {
  await requirePermission('page:quick_sale');
  return listQuickSaleHolds();
}

export async function loadQuickSaleHoldAction(invoiceId: string) {
  await requirePermission('page:quick_sale');
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
    await requirePermission('page:quick_sale');
    const holdInvoiceId = await saveQuickSaleHold(input);
    revalidatePath('/quick-sale');
    return { success: 'Bill held', holdInvoiceId };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not hold bill' };
  }
}
