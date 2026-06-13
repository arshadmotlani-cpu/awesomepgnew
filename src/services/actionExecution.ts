import { sendEmail } from '@/src/lib/email/send';
import { paiseToInr } from '@/src/lib/format';
import type { ActionItemDetail } from '@/src/services/actionItems';
import {
  buildWhatsAppUrlForActionItem,
  createPaymentLink,
} from '@/src/services/paymentLinks';

export type ExecuteActionInput = {
  actionType: string;
  detail: ActionItemDetail;
};

export type ExecuteActionResult =
  | { ok: true; kind: 'url'; url: string; label: string }
  | { ok: true; kind: 'payment_link'; qrUrl: string; whatsappUrl: string | null; upiId: string | null }
  | { ok: true; kind: 'done'; message: string }
  | { ok: false; message: string };

export async function executeActionItemAction(
  input: ExecuteActionInput,
): Promise<ExecuteActionResult> {
  const { actionType, detail } = input;
  const meta = detail.metadata;

  switch (actionType) {
    case 'send_whatsapp': {
      const url = buildWhatsAppUrlForActionItem(detail);
      if (!url) return { ok: false, message: 'Could not build WhatsApp link — check phone number.' };
      return { ok: true, kind: 'url', url, label: 'WhatsApp' };
    }

    case 'send_email': {
      const email = detail.residentEmail ?? meta.residentEmail;
      if (!email) return { ok: false, message: 'No email on file for this resident.' };
      const amount =
        detail.amount != null ? ` Amount due: ${paiseToInr(detail.amount)}.` : '';
      const subject = `[Awesome PG] ${detail.title}`;
      const text =
        `Hi ${meta.residentName ?? detail.residentName ?? 'there'},\n\n` +
        `This is a reminder regarding: ${detail.title}.${amount}\n\n` +
        `Please log in to your resident dashboard or contact us if you need help.\n\n` +
        `— Awesome PG Admin`;

      const result = await sendEmail({ to: email, subject, text });
      if (!result.ok) return { ok: false, message: result.message };
      return { ok: true, kind: 'done', message: `Email sent to ${email}.` };
    }

    case 'generate_payment_link': {
      if (!detail.residentId || !detail.amount) {
        return { ok: false, message: 'Missing resident or amount for payment link.' };
      }
      const purpose =
        detail.type === 'electricity_due'
          ? 'electricity'
          : detail.type === 'refund_pending'
            ? 'deposit'
            : 'rent';
      const result = await createPaymentLink({
        residentId: detail.residentId,
        pgId: detail.pgId,
        amountPaise: detail.amount,
        purpose,
        residentName: meta.residentName ?? detail.residentName ?? 'Resident',
        residentPhone: detail.residentPhone ?? meta.residentPhone ?? '',
        pgName: meta.pgName ?? detail.pgName,
        dueDate: detail.dueDate ?? undefined,
        roomNumber: meta.roomNumber ?? detail.roomNumber ?? undefined,
        isOverdue: meta.isOverdue,
      });
      if (!result.ok) return { ok: false, message: result.message };
      return {
        ok: true,
        kind: 'payment_link',
        qrUrl: result.link.upiQrUrl,
        whatsappUrl: result.link.whatsappShareUrl,
        upiId: result.upiId,
      };
    }

    case 'open_payment_qr': {
      if (!detail.residentId || !detail.amount) {
        return { ok: false, message: 'Missing resident or amount.' };
      }
      const purpose = detail.type === 'electricity_due' ? 'electricity' : 'rent';
      const result = await createPaymentLink({
        residentId: detail.residentId,
        pgId: detail.pgId,
        amountPaise: detail.amount,
        purpose,
        residentName: meta.residentName ?? detail.residentName ?? 'Resident',
        residentPhone: detail.residentPhone ?? meta.residentPhone ?? '',
        pgName: meta.pgName ?? detail.pgName,
        dueDate: detail.dueDate ?? undefined,
        roomNumber: meta.roomNumber ?? detail.roomNumber ?? undefined,
        isOverdue: meta.isOverdue,
      });
      if (!result.ok) return { ok: false, message: result.message };
      return { ok: true, kind: 'url', url: result.link.upiQrUrl, label: 'UPI QR' };
    }

    default:
      return { ok: false, message: 'Unknown action type.' };
  }
}
