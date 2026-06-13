import { paiseToInr } from '@/src/lib/format';
import { whatsAppPhoneDigits } from '@/src/lib/kyc/adminWhatsApp';

export type BillingWhatsAppKind = 'rent' | 'electricity';

export type BillingWhatsAppInput = {
  kind: BillingWhatsAppKind;
  customerName: string;
  phone: string;
  pgName: string;
  amountPaise: number;
  dueDate: string;
  billingMonth?: string;
  roomNumber?: string;
  isOverdue?: boolean;
};

export function buildBillingWhatsAppMessage(input: BillingWhatsAppInput): string {
  const firstName = input.customerName.trim().split(/\s+/)[0] || 'there';
  const amount = paiseToInr(input.amountPaise);

  if (input.kind === 'rent') {
    if (input.isOverdue) {
      return (
        `Hi ${firstName}, your rent of ${amount} for ${input.pgName} is overdue. ` +
        `Please clear it immediately via UPI or QR to avoid further penalty.`
      );
    }
    return (
      `Hi ${firstName}, your rent of ${amount} for ${input.pgName} is due on ${input.dueDate}. ` +
      `Please pay via UPI or QR to avoid late fees.`
    );
  }

  const room = input.roomNumber ? ` · Room ${input.roomNumber}` : '';
  if (input.isOverdue) {
    return (
      `Hi ${firstName}, your electricity bill of ${amount} for ${input.pgName}${room} is overdue. ` +
      `Please pay from your resident dashboard or via QR immediately.`
    );
  }
  return (
    `Hi ${firstName}, your electricity share of ${amount} for ${input.pgName}${room} is due on ${input.dueDate}. ` +
    `Please pay from your resident dashboard or via QR.`
  );
}

export function buildBillingWhatsAppUrl(input: BillingWhatsAppInput): string | null {
  const digits = whatsAppPhoneDigits(input.phone);
  if (!digits) return null;
  const text = buildBillingWhatsAppMessage(input);
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export { openWhatsAppUrl } from '@/src/lib/kyc/adminWhatsApp';

export type BillingReminderQueueItem = {
  id: string;
  kind: BillingWhatsAppKind;
  customerName: string;
  phone: string;
  pgName: string;
  roomNumber?: string;
  bedCode?: string;
  amountPaise: number;
  dueDate: string;
  billingMonth?: string;
  isOverdue: boolean;
};

export function billingRemindersNeedingWhatsApp(
  rows: BillingReminderQueueItem[],
): BillingReminderQueueItem[] {
  return rows.filter((r) => Boolean(whatsAppPhoneDigits(r.phone)));
}
