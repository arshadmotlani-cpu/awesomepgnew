'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import { assertAdminFinancialInvoiceAccess } from '@/src/lib/auth/pgAccess';
import {
  cancelUnifiedInvoice,
  createPaymentLinkForInvoice,
  refundUnifiedInvoice,
} from '@/src/services/unifiedInvoices';
import { getInvoiceDocumentDetail } from '@/src/lib/billing/invoiceDocumentModel';
import {
  buildInvoicePublicUrl,
  buildInvoiceWhatsAppSendPayload,
} from '@/src/lib/billing/sendInvoiceOnWhatsApp';
import { voidInvoiceCompletely } from '@/src/services/invoiceVoid';

export type InvoiceActionState =
  | { status: 'idle' }
  | { status: 'ok'; message: string; whatsappUrl?: string | null; paymentUrl?: string }
  | { status: 'error'; message: string };

function revalidateInvoice(invoiceId: string) {
  revalidatePath('/admin/invoices');
  revalidatePath(`/admin/invoices/${invoiceId}`);
  revalidatePath(`/account/resident/invoices/${invoiceId}`);
  revalidatePath('/admin/overview');
  revalidatePath('/admin/revenue');
  revalidatePath('/admin/collections');
  revalidatePath('/admin/residents');
  revalidatePath('/admin/operations');
}

export async function cancelInvoiceAction(
  _prev: InvoiceActionState,
  formData: FormData,
): Promise<InvoiceActionState> {
  try {
    const session = await requireAdminPermission('payments:write');
    const invoiceId = String(formData.get('invoiceId') ?? '');
    const reason = String(formData.get('reason') ?? 'Cancelled by admin').trim();
    if (!invoiceId) return { status: 'error', message: 'Missing invoice ID.' };

    await assertAdminFinancialInvoiceAccess(session, invoiceId);

    const result = await cancelUnifiedInvoice(invoiceId, reason, {
      type: 'admin',
      id: session.adminId,
    });
    if (!result.ok) return { status: 'error', message: result.error };

    revalidateInvoice(invoiceId);
    const diff = result.audit.differencePaise;
    const diffNote =
      diff === 0
        ? 'Outstanding unchanged (collection document only).'
        : `Outstanding ${diff > 0 ? 'increased' : 'decreased'} by ₹${Math.abs(diff / 100).toFixed(2)}.`;
    return {
      status: 'ok',
      message: `Invoice cancelled. Before ₹${(result.audit.beforeOutstandingPaise / 100).toFixed(2)} → after ₹${(result.audit.afterOutstandingPaise / 100).toFixed(2)}. ${diffNote}`,
    };
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : 'Could not cancel invoice.',
    };
  }
}

export async function voidInvoiceCompletelyAction(
  _prev: InvoiceActionState,
  formData: FormData,
): Promise<InvoiceActionState> {
  try {
    const session = await requireAdminPermission('payments:write');
    const invoiceId = String(formData.get('invoiceId') ?? '');
    const reason = String(formData.get('reason') ?? 'Voided by admin — remove all traces').trim();
    if (!invoiceId) return { status: 'error', message: 'Missing invoice ID.' };
    if (!reason) return { status: 'error', message: 'Enter a reason.' };

    await assertAdminFinancialInvoiceAccess(session, invoiceId);

    const result = await voidInvoiceCompletely(invoiceId, reason, {
      type: 'admin',
      id: session.adminId,
    }, { archiveCustomer: true });

    if (!result.ok) return { status: 'error', message: result.error };

    revalidateInvoice(invoiceId);
    return { status: 'ok', message: result.message };
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : 'Could not void invoice.',
    };
  }
}

export async function refundInvoiceAction(
  _prev: InvoiceActionState,
  formData: FormData,
): Promise<InvoiceActionState> {
  try {
    const session = await requireAdminPermission('payments:write');
    const invoiceId = String(formData.get('invoiceId') ?? '');
    const reason = String(formData.get('reason') ?? 'Refunded by admin').trim();
    if (!invoiceId) return { status: 'error', message: 'Missing invoice ID.' };

    await assertAdminFinancialInvoiceAccess(session, invoiceId);

    const result = await refundUnifiedInvoice(invoiceId, reason, {
      type: 'admin',
      id: session.adminId,
    });
    if (!result.ok) return { status: 'error', message: result.error };

    revalidateInvoice(invoiceId);
    return { status: 'ok', message: 'Invoice refunded. Revenue and collections updated automatically.' };
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : 'Could not refund invoice.',
    };
  }
}

export async function invoicePaymentLinkAction(
  _prev: InvoiceActionState,
  formData: FormData,
): Promise<InvoiceActionState> {
  try {
    const session = await requireAdminPermission('payments:write');
    const invoiceId = String(formData.get('invoiceId') ?? '');
    if (!invoiceId) return { status: 'error', message: 'Missing invoice ID.' };

    await assertAdminFinancialInvoiceAccess(session, invoiceId);

    const result = await createPaymentLinkForInvoice(invoiceId);
    if (!result.ok) return { status: 'error', message: result.message };

    revalidateInvoice(invoiceId);
    return {
      status: 'ok',
      message: 'Payment link created.',
      paymentUrl: result.publicUrl,
      whatsappUrl: result.whatsappShareUrl,
    };
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : 'Could not create payment link.',
    };
  }
}

export async function invoiceWhatsAppAction(
  _prev: InvoiceActionState,
  formData: FormData,
): Promise<InvoiceActionState> {
  try {
    const session = await requireAdminPermission('payments:write');
    const invoiceId = String(formData.get('invoiceId') ?? '');
    if (!invoiceId) return { status: 'error', message: 'Missing invoice ID.' };

    await assertAdminFinancialInvoiceAccess(session, invoiceId);

    let detail = await getInvoiceDocumentDetail(invoiceId);
    if (!detail) return { status: 'error', message: 'Invoice not found.' };

    if (
      !detail.payment.paymentLinkUrl &&
      detail.status !== 'paid' &&
      detail.status !== 'cancelled' &&
      detail.status !== 'refunded'
    ) {
      const link = await createPaymentLinkForInvoice(invoiceId);
      if (link.ok) {
        detail = (await getInvoiceDocumentDetail(invoiceId)) ?? detail;
      }
    }

    const publicInvoiceUrl = buildInvoicePublicUrl(
      invoiceId,
      'resident',
      undefined,
      detail.invoiceNumber,
    );
    const payload = buildInvoiceWhatsAppSendPayload(detail, publicInvoiceUrl);

    if (!payload.whatsappUrl) {
      return { status: 'error', message: 'Resident phone number is missing or invalid.' };
    }

    return {
      status: 'ok',
      message: 'WhatsApp message ready.',
      whatsappUrl: payload.whatsappUrl,
      paymentUrl: detail.payment.paymentLinkUrl ?? undefined,
    };
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : 'Could not build WhatsApp message.',
    };
  }
}
