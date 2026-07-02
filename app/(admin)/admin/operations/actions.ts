'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminPermission, requireAdminSession } from '@/src/lib/auth/guards';
import { adminCanAccessPg } from '@/src/lib/auth/roles';
import { buildInvoicePublicUrlForInvoice } from '@/src/lib/billing/sendInvoiceOnWhatsApp';
import { buildOperationsPaymentWhatsAppUrl } from '@/src/lib/operations/operationsPaymentWhatsApp';
import type { ResidentOpsQueueCategory } from '@/src/lib/residents/residentOperationsDashboard';
import { getOrCreatePaymentLink } from '@/src/services/paymentLinks';
import {
  parseDomainIdsFromQueueItemId,
  recordOperationsQueueDismissal,
} from '@/src/services/operationsQueueDismissals';
import type { UnifiedOpsOutstandingLine } from '@/src/services/unifiedOperationsQueue';

export type DismissOperationsQueueState =
  | { status: 'idle' }
  | { status: 'ok'; message: string }
  | { status: 'error'; message: string };

export async function dismissOperationsQueueItemAction(
  _prev: DismissOperationsQueueState,
  formData: FormData,
): Promise<DismissOperationsQueueState> {
  try {
    const session = await requireAdminSession();
    if (session.role !== 'super_admin') {
      return { status: 'error', message: 'Only super admins can dismiss queue items.' };
    }

    const queueItemId = String(formData.get('queueItemId') ?? '').trim();
    const category = String(formData.get('category') ?? '').trim() as ResidentOpsQueueCategory;
    const customerId = String(formData.get('customerId') ?? '').trim();
    const bookingIdRaw = String(formData.get('bookingId') ?? '').trim();
    const vacatingRequestIdRaw = String(formData.get('vacatingRequestId') ?? '').trim();
    const residentName = String(formData.get('residentName') ?? '').trim();

    if (!queueItemId || !customerId || !category) {
      return { status: 'error', message: 'Missing queue item details.' };
    }

    const parsed = parseDomainIdsFromQueueItemId(queueItemId);
    const bookingId = bookingIdRaw || parsed.bookingId;
    const vacatingRequestId = vacatingRequestIdRaw || parsed.vacatingRequestId;
    const settlementId = parsed.settlementId;

    await recordOperationsQueueDismissal({
      adminId: session.adminId,
      queueItemId,
      category,
      customerId,
      bookingId: bookingId || null,
      vacatingRequestId: vacatingRequestId || null,
      settlementId,
    });

    revalidatePath('/admin/operations');
    return {
      status: 'ok',
      message: residentName
        ? `${residentName} removed from Operations queue.`
        : 'Removed from Operations queue.',
    };
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : 'Could not dismiss queue item.',
    };
  }
}

export async function openOperationsPaymentWhatsAppAction(input: {
  residentId: string;
  residentName: string;
  residentPhone: string;
  pgId: string;
  pgName: string;
  roomNumber?: string | null;
  lines: UnifiedOpsOutstandingLine[];
}): Promise<{ ok: true; whatsappUrl: string } | { ok: false; message: string }> {
  const session = await requireAdminPermission('payments:write');

  if (!adminCanAccessPg({ role: session.role, pgScope: session.pgScope }, input.pgId)) {
    return { ok: false, message: 'Access denied for this PG.' };
  }

  if (input.lines.length === 0) {
    return { ok: false, message: 'No outstanding items to collect.' };
  }

  const resolved: Array<UnifiedOpsOutstandingLine & { paymentUrl: string }> = [];

  for (const line of input.lines) {
    if (line.kind === 'deposit') {
      if (!line.bookingId) {
        return { ok: false, message: 'Missing booking for deposit payment link.' };
      }
      const link = await getOrCreatePaymentLink({
        residentId: input.residentId,
        pgId: input.pgId,
        pgName: input.pgName,
        residentName: input.residentName,
        residentPhone: input.residentPhone,
        amountPaise: line.amountPaise,
        purpose: 'deposit',
        bookingId: line.bookingId,
        roomNumber: input.roomNumber ?? undefined,
        dueDate: line.periodLabel,
      });
      if (!link.ok) return { ok: false, message: link.message };
      resolved.push({ ...line, paymentUrl: link.publicUrl });
      continue;
    }

    if (!line.financialInvoiceId) {
      return { ok: false, message: `Missing invoice link for ${line.categoryLabel}.` };
    }

    try {
      const paymentUrl = await buildInvoicePublicUrlForInvoice(line.financialInvoiceId);
      resolved.push({ ...line, paymentUrl });
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : 'Could not build invoice payment link.',
      };
    }
  }

  const whatsappUrl = buildOperationsPaymentWhatsAppUrl({
    residentPhone: input.residentPhone,
    residentName: input.residentName,
    pgName: input.pgName,
    lines: resolved,
  });

  if (!whatsappUrl) {
    return { ok: false, message: 'Could not open WhatsApp — check the resident phone number.' };
  }

  return { ok: true, whatsappUrl };
}
