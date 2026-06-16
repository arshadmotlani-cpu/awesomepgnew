import { paiseToInr } from '@/src/lib/format';
import { whatsAppPhoneDigits } from '@/src/lib/kyc/adminWhatsApp';

export type BillingWhatsAppKind = 'rent' | 'electricity' | 'deposit';

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
  /** When set, message includes this payment link (rent / electricity). */
  paymentLinkUrl?: string;
  /** Combined rent + deposit messaging. */
  rentPaise?: number;
  depositDuePaise?: number;
};

export type RentUpdatedWhatsAppInput = {
  customerName: string;
  phone: string;
  pgName: string;
  newAmountPaise: number;
  paymentLinkUrl?: string;
};

export function buildBillingWhatsAppMessage(input: BillingWhatsAppInput): string {
  const firstName = input.customerName.trim().split(/\s+/)[0] || 'there';
  const amount = paiseToInr(input.amountPaise);

  if (input.kind === 'rent') {
    if (input.paymentLinkUrl) {
      if (input.rentPaise && input.depositDuePaise) {
        return (
          `Hi ${firstName},\n\n` +
          `Rent due: ${paiseToInr(input.rentPaise)}\n` +
          `Remaining deposit: ${paiseToInr(input.depositDuePaise)}\n` +
          `Total: ${amount}\n\nPay here:\n${input.paymentLinkUrl}`
        );
      }
      return `Hi ${firstName},\n\nYour rent due is ${amount}.\n\nPay here:\n${input.paymentLinkUrl}`;
    }
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

  if (input.kind === 'deposit') {
    if (input.paymentLinkUrl) {
      return `Hi ${firstName},\n\nYour remaining deposit due is ${amount}.\n\nPay here:\n${input.paymentLinkUrl}`;
    }
    if (input.isOverdue) {
      return (
        `Hi ${firstName}, your remaining deposit due of ${amount} for ${input.pgName} is overdue. ` +
        `Please pay via UPI or contact the office immediately.`
      );
    }
    return (
      `Hi ${firstName}, your remaining deposit due of ${amount} for ${input.pgName} is due by ${input.dueDate}. ` +
      `Please pay via UPI or contact the office.`
    );
  }

  const room = input.roomNumber ? ` · Room ${input.roomNumber}` : '';
  if (input.paymentLinkUrl) {
    return `Hi ${firstName},\n\nYour electricity bill is ${amount}.\n\nPay here:\n${input.paymentLinkUrl}`;
  }
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

export function buildRentUpdatedWhatsAppMessage(input: {
  customerName: string;
  pgName: string;
  newAmountPaise: number;
  paymentLinkUrl?: string;
}): string {
  const firstName = input.customerName.trim().split(/\s+/)[0] || 'there';
  const amount = paiseToInr(input.newAmountPaise);
  if (input.paymentLinkUrl) {
    return (
      `Hi ${firstName}, your rent has been updated to ${amount} for ${input.pgName}. ` +
      `Please review and complete payment here: ${input.paymentLinkUrl}`
    );
  }
  return (
    `Hi ${firstName}, your rent has been updated to ${amount} for ${input.pgName}. ` +
    `Please pay via UPI or contact the office for the payment link.`
  );
}

export type DepositDueWhatsAppInput = {
  customerName: string;
  phone: string;
  pgName: string;
  amountPaise: number;
  dueDate: string;
  paymentLinkUrl?: string;
  isOverdue?: boolean;
};

export function buildDepositDueWhatsAppMessage(input: Omit<DepositDueWhatsAppInput, 'phone'>): string {
  const firstName = input.customerName.trim().split(/\s+/)[0] || 'there';
  const amount = paiseToInr(input.amountPaise);
  if (input.paymentLinkUrl) {
    if (input.isOverdue) {
      return (
        `Hi ${firstName}, your remaining security deposit of ${amount} for ${input.pgName} is overdue. ` +
        `Please pay using this link: ${input.paymentLinkUrl}`
      );
    }
    return (
      `Hi ${firstName}, your remaining security deposit of ${amount} for ${input.pgName} is due by ${input.dueDate}. ` +
      `Please complete payment using this link: ${input.paymentLinkUrl}`
    );
  }
  if (input.isOverdue) {
    return (
      `Hi ${firstName}, your remaining security deposit of ${amount} for ${input.pgName} is overdue. ` +
      `Please pay via UPI or contact the office immediately.`
    );
  }
  return (
    `Hi ${firstName}, your remaining security deposit of ${amount} for ${input.pgName} is due by ${input.dueDate}. ` +
    `Please pay via UPI or contact the office.`
  );
}

export function buildDepositDueWhatsAppUrl(input: DepositDueWhatsAppInput): string | null {
  const digits = whatsAppPhoneDigits(input.phone);
  if (!digits) return null;
  const text = buildDepositDueWhatsAppMessage(input);
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export function buildRentUpdatedWhatsAppUrl(input: RentUpdatedWhatsAppInput): string | null {
  const digits = whatsAppPhoneDigits(input.phone);
  if (!digits) return null;
  const text = buildRentUpdatedWhatsAppMessage({
    customerName: input.customerName,
    pgName: input.pgName,
    newAmountPaise: input.newAmountPaise,
    paymentLinkUrl: input.paymentLinkUrl,
  });
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export function buildBillingWhatsAppUrl(input: BillingWhatsAppInput): string | null {
  const digits = whatsAppPhoneDigits(input.phone);
  if (!digits) return null;
  const text = buildBillingWhatsAppMessage(input);
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

/** Operator-generated charge request (deposit / rent / custom via payment link). */
export function buildChargeRequestWhatsAppMessage(input: {
  customerName: string;
  title: string;
  amountPaise: number;
  paymentLinkUrl: string;
}): string {
  const name = input.customerName.trim() || 'Resident';
  const amount = paiseToInr(input.amountPaise);
  return (
    `Hello ${name},\n\n` +
    `A payment request has been generated for:\n\n` +
    `${input.title.trim()}\n\n` +
    `Amount: ${amount}\n\n` +
    `Please complete the payment using the link below and upload payment proof after payment.\n\n` +
    `${input.paymentLinkUrl}\n\n` +
    `Thank you.`
  );
}

export function buildChargeRequestWhatsAppUrl(input: {
  customerName: string;
  customerPhone: string;
  title: string;
  amountPaise: number;
  paymentLinkUrl: string;
}): string | null {
  const digits = whatsAppPhoneDigits(input.customerPhone);
  if (!digits) return null;
  const text = buildChargeRequestWhatsAppMessage(input);
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
