'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import {
  cancelUnifiedInvoice,
  createPaymentLinkForInvoice,
  refundUnifiedInvoice,
} from '@/src/services/unifiedInvoices';
import { buildInvoiceWhatsAppUrl } from '@/src/lib/billing/invoiceWhatsApp';
import { paymentLinkPublicUrl } from '@/src/lib/billing/paymentLinkUrl';
import { getUnifiedInvoiceDetail } from '@/src/services/unifiedInvoices';

export type InvoiceActionState =
  | { status: 'idle' }
  | { status: 'ok'; message: string; whatsappUrl?: string | null; paymentUrl?: string }
  | { status: 'error'; message: string };

function revalidateInvoice(invoiceId: string) {
  revalidatePath('/admin/invoices');
  revalidatePath(`/admin/invoices/${invoiceId}`);
  revalidatePath('/admin/overview');
  revalidatePath('/admin/revenue');
  revalidatePath('/admin/collections');
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

    const result = await cancelUnifiedInvoice(invoiceId, reason, {
      type: 'admin',
      id: session.adminId,
    });
    if (!result.ok) return { status: 'error', message: result.error };

    revalidateInvoice(invoiceId);
    return { status: 'ok', message: 'Invoice cancelled. Revenue and collections updated automatically.' };
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : 'Could not cancel invoice.',
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
    await requireAdminPermission('payments:write');
    const invoiceId = String(formData.get('invoiceId') ?? '');
    if (!invoiceId) return { status: 'error', message: 'Missing invoice ID.' };

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
    await requireAdminPermission('payments:write');
    const invoiceId = String(formData.get('invoiceId') ?? '');
    if (!invoiceId) return { status: 'error', message: 'Missing invoice ID.' };

    const detail = await getUnifiedInvoiceDetail(invoiceId);
    if (!detail) return { status: 'error', message: 'Invoice not found.' };

    let paymentUrl = detail.paymentLink ? paymentLinkPublicUrl(detail.paymentLink.id) : undefined;
    if (!paymentUrl && detail.status !== 'paid' && detail.status !== 'cancelled') {
      const link = await createPaymentLinkForInvoice(invoiceId);
      if (link.ok) paymentUrl = link.publicUrl;
    }

    const whatsappUrl = buildInvoiceWhatsAppUrl({
      customerName: detail.customerName,
      customerPhone: detail.customerPhone,
      invoiceNumber: detail.invoiceNumber,
      amountPaise: detail.amountPaise,
      paymentLinkUrl: paymentUrl,
    });

    if (!whatsappUrl) {
      return { status: 'error', message: 'Resident phone number is missing or invalid.' };
    }

    return { status: 'ok', message: 'WhatsApp message ready.', whatsappUrl, paymentUrl };
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : 'Could not build WhatsApp message.',
    };
  }
}
