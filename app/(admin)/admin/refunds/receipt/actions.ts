'use server';

import { requireAdminPermission } from '@/src/lib/auth/guards';
import { getAppUrl } from '@/src/lib/url';
import { depositRefundReceiptHref } from '@/src/lib/refund/refundReceiptLinks';
import { getDepositRefundReceiptDocument } from '@/src/services/depositRefundReceipt';
import { formatDateTime, paiseToInr } from '@/src/lib/format';

export type RefundReceiptActionState =
  | { status: 'idle' }
  | { status: 'ok'; whatsappUrl: string }
  | { status: 'error'; message: string };

export async function refundReceiptWhatsAppAction(
  _prev: RefundReceiptActionState,
  formData: FormData,
): Promise<RefundReceiptActionState> {
  try {
    await requireAdminPermission('deposits:write');
    const settlementId = String(formData.get('settlementId') ?? '').trim();
    if (!settlementId) return { status: 'error', message: 'Missing receipt.' };

    const doc = await getDepositRefundReceiptDocument(settlementId);
    if (!doc) return { status: 'error', message: 'Receipt not found.' };

    const phone = doc.residentPhone?.replace(/\D/g, '') ?? '';
    if (!phone) return { status: 'error', message: 'Resident has no phone number on file.' };

    const link = `${getAppUrl()}${depositRefundReceiptHref(settlementId)}`;
    const text = [
      `Hi ${doc.residentName},`,
      '',
      `Your deposit refund of ${paiseToInr(doc.refundPaidPaise)} has been processed.`,
      `Receipt: ${doc.receiptNumber}`,
      `Booking: ${doc.bookingCode}`,
      doc.refundReference ? `Reference: ${doc.refundReference}` : null,
      `Date: ${formatDateTime(doc.refundedAt)}`,
      '',
      `View receipt: ${link}`,
    ]
      .filter(Boolean)
      .join('\n');

    const whatsappUrl = `https://wa.me/91${phone.replace(/^91/, '')}?text=${encodeURIComponent(text)}`;
    return { status: 'ok', whatsappUrl };
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : 'Could not open WhatsApp.',
    };
  }
}
