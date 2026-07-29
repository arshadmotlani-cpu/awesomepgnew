'use server';

import { revalidatePath } from 'next/cache';
import { requireHairAuth } from '@/src/hair/lib/auth/guards';
import { createCustomerQuick } from '@/src/hair/services/customers';
import {
  buildInvoicePrintHtml,
  finalizeQuickSale,
  getInvoiceDetail,
  type PaymentSplitInput,
  type QuickSaleLineInput,
} from '@/src/hair/services/invoices';
import { previewQuickSaleTotals, searchCustomersForPos, searchStaffForPos } from '@/src/hair/services/quickSale';

export type QuickSaleActionState = { error?: string; success?: string; invoiceId?: string };

export async function searchCustomersForPosAction(query: string) {
  await requireHairAuth();
  return searchCustomersForPos(query);
}

export async function searchStaffForPosAction(query: string) {
  await requireHairAuth();
  return searchStaffForPos(query);
}

export async function createQuickCustomerAction(
  _prev: QuickSaleActionState,
  formData: FormData,
): Promise<QuickSaleActionState & { customer?: { id: string; fullName: string; customerCode: string | null; phone: string } }> {
  try {
    await requireHairAuth();
    const fullName = String(formData.get('fullName') ?? '').trim();
    const phone = String(formData.get('phone') ?? '').trim();
    const genderRaw = String(formData.get('gender') ?? 'female').trim();
    const gender =
      genderRaw === 'male' || genderRaw === 'other' || genderRaw === 'prefer_not_to_say'
        ? genderRaw
        : 'female';
    const row = await createCustomerQuick({ fullName, phone, gender });
    revalidatePath('/customers');
    return {
      success: 'Customer created',
      customer: {
        id: row.id,
        fullName: row.fullName,
        customerCode: row.customerCode,
        phone: row.phone,
      },
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not create customer' };
  }
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
