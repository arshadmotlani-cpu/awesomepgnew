'use server';

import { revalidatePath } from 'next/cache';
import { requireFyhPermission } from '@/src/workforce/permissions/guards';
import { createQuickCustomerFromForm } from '@/src/hair/actions/quickSaleCustomer';
import type { Basket } from '@/src/hair/domain/basket/types';
import { enrichBasketWithRedemptions, checkoutFromBasket } from '@/src/hair/domain/checkout/pipeline';
import {
  buildPublicInvoicePrintHtml,
  getInvoiceDetail,
} from '@/src/hair/services/invoices';
import {
  buildPublicInvoiceViewModel,
  renderPublicInvoiceSheetHtml,
} from '@/src/hair/lib/publicInvoiceDocument';
import type { QuickSaleLineInput } from '@/src/hair/services/invoices';
import {
  listStaffForPosRoster,
  previewQuickSaleTotals,
  searchCustomersForPos,
  searchStaffForPos,
} from '@/src/hair/services/quickSale';
import {
  listQuickSaleHolds,
  loadQuickSaleHold,
  saveQuickSaleHold,
} from '@/src/hair/services/quickSaleHold';
import type { QuickSalePosDraft } from '@/src/hair/db/schema/billing';
import { getTenantContextForAction } from '@/src/hair/lib/tenant/getTenantContext';

export type QuickSaleActionState = { error?: string; success?: string; invoiceId?: string };

export async function searchCustomersForPosAction(query: string) {
  await requireFyhPermission({ permission: 'quick_sale.customer.search', scope: 'org' });
  return searchCustomersForPos(query);
}

export async function searchStaffForPosAction(query: string) {
  await requireFyhPermission({ permission: 'quick_sale.access', scope: 'org' });
  return searchStaffForPos(query);
}

/** Full bookable staff roster for Quick Sale — preload once per sale session. */
export async function listStaffForPosRosterAction() {
  await requireFyhPermission({ permission: 'quick_sale.access', scope: 'org' });
  return listStaffForPosRoster();
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
  await requireFyhPermission({ permission: 'quick_sale.sale.create', scope: 'org' });
  return previewQuickSaleTotals(input.customerId, input.cartLines, input);
}

export async function completeQuickSaleAction(input: {
  basket: Basket;
  holdInvoiceId?: string | null;
  source?: 'quick_sale' | 'appointment';
  appointmentId?: string;
}): Promise<
  QuickSaleActionState & { advancePaise?: number; invoiceNumber?: string }
> {
  try {
    await requireFyhPermission({ permission: 'quick_sale.sale.complete', scope: 'org' });
    const ctx = await getTenantContextForAction();
    const enriched = await enrichBasketWithRedemptions(input.basket);
    const result = await checkoutFromBasket({
      basket: enriched,
      holdInvoiceId: input.holdInvoiceId,
      source: input.source,
      appointmentId: input.appointmentId,
      ctx,
    });
    revalidatePath('/billing');
    revalidatePath('/dashboard/revenue');
    revalidatePath('/quick-sale');
    if (input.source === 'appointment' || input.appointmentId) {
      revalidatePath('/appointments');
    }
    let invoiceNumber: string | undefined;
    try {
      const detail = await getInvoiceDetail(result.invoiceId, ctx);
      invoiceNumber = detail?.invoice.invoiceNumber;
    } catch {
      // Invoice is committed; invoice number is best-effort.
    }
    return {
      success: 'Sale complete',
      invoiceId: result.invoiceId,
      invoiceNumber,
      advancePaise: result.advancePaise,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not complete sale' };
  }
}

export type QuickSaleInvoicePreviewResult =
  | {
      ok: true;
      sheetHtml: string;
      printDocumentHtml: string;
      invoiceNumber: string;
      publicAccessToken: string;
      customerName: string;
      customerPhone: string;
      stylistName: string | null;
      grandTotalLabel: string;
      paidLabel: string;
      paymentModes: string;
      statusLabel: string;
      invoiceDateTime: string;
    }
  | { ok: false; error: string };

function formatQuickSaleInvoiceDateTime(date: Date): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

export async function getQuickSaleInvoicePreviewAction(
  invoiceId: string,
): Promise<QuickSaleInvoicePreviewResult> {
  try {
    await requireFyhPermission({ permission: 'quick_sale.access', scope: 'org' });
    const ctx = await getTenantContextForAction();
    const detail = await getInvoiceDetail(invoiceId, ctx);
    if (!detail) return { ok: false, error: 'Invoice not found' };
    const vm = buildPublicInvoiceViewModel(detail);
    return {
      ok: true,
      sheetHtml: renderPublicInvoiceSheetHtml(detail),
      printDocumentHtml: buildPublicInvoicePrintHtml(detail),
      invoiceNumber: detail.invoice.invoiceNumber,
      publicAccessToken: detail.invoice.publicAccessToken,
      customerName: detail.customerName,
      customerPhone: detail.customerPhone,
      stylistName: detail.stylistName ?? null,
      grandTotalLabel: vm.grandTotalLabel,
      paidLabel: vm.paidLabel,
      paymentModes: vm.paymentModes,
      statusLabel: vm.statusLabel,
      invoiceDateTime: formatQuickSaleInvoiceDateTime(detail.invoice.createdAt),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to load invoice' };
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
    await requireFyhPermission({ permission: 'quick_sale.sale.complete', scope: 'org' });
    const ctx = await getTenantContextForAction();
    const invoiceId = await finalizeQuickSale(input);
    revalidatePath('/billing');
    revalidatePath('/dashboard/revenue');
    revalidatePath('/quick-sale');
    const detail = await getInvoiceDetail(invoiceId, ctx);
    const printHtml = detail ? buildInvoicePrintHtml(detail) : undefined;
    return { success: 'Sale complete', invoiceId, printHtml };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not complete sale' };
  }
}

export async function listQuickSaleHoldsAction() {
  await requireFyhPermission({ permission: 'quick_sale.sale.resume', scope: 'org' });
  return listQuickSaleHolds();
}

export async function loadQuickSaleHoldAction(invoiceId: string) {
  await requireFyhPermission({ permission: 'quick_sale.sale.resume', scope: 'org' });
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
    await requireFyhPermission({ permission: 'quick_sale.sale.hold', scope: 'org' });
    const holdInvoiceId = await saveQuickSaleHold(input);
    revalidatePath('/quick-sale');
    return { success: 'Bill held', holdInvoiceId };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not hold bill' };
  }
}
