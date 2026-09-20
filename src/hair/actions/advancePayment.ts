'use server';

import { revalidatePath } from 'next/cache';
import {
  isPermissionError,
  requirePermission,
} from '@/src/hair/lib/auth/permissions';
import {
  ADVANCE_RECEIVE_PERMISSION,
} from '@/src/hair/lib/advancePaymentPermissions';
import { getTenantContextForAction } from '@/src/hair/lib/tenant/getTenantContext';
import { TenantContextError } from '@/src/hair/lib/tenant/resolveTenantContext';
import {
  recordAdvancePayment,
  type AdvancePaymentMethod,
} from '@/src/hair/services/loyaltyOps';
import { searchCustomersForPos } from '@/src/hair/services/quickSale';
import { formatInrFromPaise } from '@/src/hair/lib/money';
import {
  buildInvoicePrintHtml,
  getInvoiceDetail,
} from '@/src/hair/services/invoices';
import { renderPublicInvoiceSheetHtml } from '@/src/hair/lib/publicInvoiceDocument';
import type { PosCustomerHit } from '@/src/hair/services/quickSale';

export type AdvancePaymentActionState = { error?: string; success?: string };

export type AdvanceCustomerSearchResult =
  | { ok: true; hits: PosCustomerHit[] }
  | { ok: false; error: string; hits: [] };

export async function searchCustomersForAdvanceAction(
  query: string,
): Promise<AdvanceCustomerSearchResult> {
  try {
    await requirePermission(ADVANCE_RECEIVE_PERMISSION);
    const ctx = await getTenantContextForAction();
    const hits = await searchCustomersForPos(query, 30, ctx);
    return { ok: true, hits };
  } catch (e) {
    const message =
      e instanceof TenantContextError
        ? e.message
        : e instanceof Error
          ? e.message
          : 'Could not search customers';
    return { ok: false, error: message, hits: [] };
  }
}

export async function submitAdvancePaymentAction(input: {
  customerId: string;
  amountPaise: number;
  method: AdvancePaymentMethod;
  reference?: string | null;
  notes?: string | null;
  paidOn?: string | null;
  idempotencyKey?: string | null;
}): Promise<
  AdvancePaymentActionState & {
    walletBalancePaise?: number;
    invoiceId?: string;
    invoiceNumber?: string;
    reused?: boolean;
  }
> {
  try {
    await requirePermission(ADVANCE_RECEIVE_PERMISSION);
    const ctx = await getTenantContextForAction();
    const result = await recordAdvancePayment(input, ctx);
    revalidatePath('/dashboard/revenue');
    revalidatePath('/billing/invoices');
    revalidatePath(`/customers/${input.customerId}`);
    revalidatePath('/advance-payment');
    return {
      success: `Customer credit updated · balance ${formatInrFromPaise(result.walletBalancePaise)}`,
      walletBalancePaise: result.walletBalancePaise,
      invoiceId: result.invoiceId,
      invoiceNumber: result.invoiceNumber,
      reused: result.reused,
    };
  } catch (e) {
    if (isPermissionError(e)) {
      return { error: e.message };
    }
    if (e instanceof TenantContextError) {
      return { error: e.message };
    }
    return { error: e instanceof Error ? e.message : 'Could not record advance payment' };
  }
}

export async function getAdvancePaymentReceiptPreviewAction(invoiceId: string): Promise<
  | {
      ok: true;
      sheetHtml: string;
      printDocumentHtml: string;
      invoiceNumber: string;
      publicAccessToken: string;
      customerName: string;
      customerPhone: string;
      grandTotalLabel: string;
    }
  | { ok: false; error: string }
> {
  try {
    await requirePermission(ADVANCE_RECEIVE_PERMISSION);
    const ctx = await getTenantContextForAction();
    const detail = await getInvoiceDetail(invoiceId, ctx);
    if (!detail) return { ok: false, error: 'Invoice not found' };
    if (detail.invoice.source !== 'advance_payment') {
      return { ok: false, error: 'Not an advance receipt' };
    }
    return {
      ok: true,
      sheetHtml: renderPublicInvoiceSheetHtml(detail),
      printDocumentHtml: buildInvoicePrintHtml(detail),
      invoiceNumber: detail.invoice.invoiceNumber,
      publicAccessToken: detail.invoice.publicAccessToken,
      customerName: detail.customerName,
      customerPhone: detail.customerPhone,
      grandTotalLabel: formatInrFromPaise(detail.invoice.grandTotalPaise),
    };
  } catch (e) {
    if (isPermissionError(e)) {
      return { ok: false, error: e.message };
    }
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to load receipt' };
  }
}
