import { eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { customers } from '@/src/db/schema';
import { paiseToInr } from '@/src/lib/format';
import { logEmailDelivery } from '@/src/lib/email/deliveryLog';
import { adminNotificationBcc, queueEmail, sendEmail } from '@/src/lib/email/send';

async function customerEmail(customerId: string): Promise<{ email: string; name: string } | null> {
  const [row] = await db
    .select({ email: customers.email, name: customers.fullName })
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1);
  if (!row?.email) return null;
  return { email: row.email, name: row.name };
}

function baseGreeting(name: string): string {
  return `Hi ${name},\n\n`;
}

type TenantNotificationInput = {
  customerId: string;
  notificationKind: string;
  subject: string;
  text: string;
};

async function deliverTenantNotification(input: TenantNotificationInput): Promise<void> {
  const c = await customerEmail(input.customerId);
  if (!c) {
    await logEmailDelivery({
      recipientEmail: '(none)',
      recipientKind: 'tenant',
      subject: input.subject,
      notificationKind: input.notificationKind,
      customerId: input.customerId,
      status: 'skipped',
      skipReason: 'Customer has no email on file',
    });
    return;
  }

  const bcc = adminNotificationBcc();
  const result = await sendEmail({
    to: c.email,
    subject: input.subject,
    text: baseGreeting(c.name) + input.text,
    bcc,
  });

  await logEmailDelivery({
    recipientEmail: c.email,
    recipientKind: 'tenant',
    subject: input.subject,
    notificationKind: input.notificationKind,
    customerId: input.customerId,
    status: result.ok ? 'sent' : 'failed',
    provider: result.ok ? result.provider : undefined,
    messageId: result.ok ? result.messageId : undefined,
    errorMessage: result.ok ? undefined : result.message,
  });

  if (bcc?.[0] && result.ok) {
    await logEmailDelivery({
      recipientEmail: bcc[0],
      recipientKind: 'admin_copy',
      subject: `[Copy] ${input.subject}`,
      notificationKind: input.notificationKind,
      customerId: input.customerId,
      status: 'sent',
      provider: result.provider,
      messageId: result.messageId,
    });
  }
}

function queueTenantNotification(input: TenantNotificationInput): void {
  void deliverTenantNotification(input).catch((err) => {
    console.error(`[email] ${input.notificationKind} failed:`, err);
  });
}

export function notifyBookingConfirmed(args: {
  customerId: string;
  bookingCode: string;
  totalPaise: number;
}): void {
  queueTenantNotification({
    customerId: args.customerId,
    notificationKind: 'booking_confirmed',
    subject: `Booking confirmed — ${args.bookingCode}`,
    text:
      `Your booking ${args.bookingCode} is confirmed.\n` +
      `Total paid: ${paiseToInr(args.totalPaise)}.\n\n` +
      `View your booking in your Awesome PG account.`,
  });
}

export function notifyPaymentReceipt(args: {
  customerId: string;
  purpose: string;
  amountPaise: number;
  reference: string;
}): void {
  queueTenantNotification({
    customerId: args.customerId,
    notificationKind: 'payment_receipt',
    subject: `Payment receipt — ${args.reference}`,
    text:
      `We received your ${args.purpose} payment of ${paiseToInr(args.amountPaise)}.\n` +
      `Reference: ${args.reference}.\n\n` +
      `Thank you for your payment.`,
  });
}

export function notifyRentReminder(args: {
  customerId: string;
  billingMonth: string;
  amountPaise: number;
  dueDate: string;
}): void {
  queueTenantNotification({
    customerId: args.customerId,
    notificationKind: 'rent_reminder',
    subject: `Rent due — ${args.billingMonth}`,
    text:
      `Your rent for ${args.billingMonth} is ${paiseToInr(args.amountPaise)}.\n` +
      `Due date: ${args.dueDate}.\n\n` +
      `Pay from your resident dashboard.`,
  });
}

export function notifyElectricityReminder(args: {
  customerId: string;
  billingMonth: string;
  amountPaise: number;
  dueDate: string;
  roomNumber?: string;
  grossRoomTotalPaise?: number;
  prepaidCreditAppliedPaise?: number;
  prepaidCreditNote?: string | null;
}): void {
  const prepaidLines: string[] = [];
  if (args.prepaidCreditAppliedPaise && args.prepaidCreditAppliedPaise > 0) {
    prepaidLines.push(
      `Room bill total: ${paiseToInr(args.grossRoomTotalPaise ?? 0)}.`,
      `Already paid offline by a previous tenant: −${paiseToInr(args.prepaidCreditAppliedPaise)}.`,
    );
    if (args.prepaidCreditNote) {
      prepaidLines.push(`Note: ${args.prepaidCreditNote}`);
    }
    prepaidLines.push(`Your share after credit: ${paiseToInr(args.amountPaise)}.`);
  }

  queueTenantNotification({
    customerId: args.customerId,
    notificationKind: 'electricity_reminder',
    subject: `Electricity bill — ${args.billingMonth}${args.roomNumber ? ` · Room ${args.roomNumber}` : ''}`,
    text:
      `Your electricity share for ${args.billingMonth} is ${paiseToInr(args.amountPaise)}.\n` +
      (prepaidLines.length ? `${prepaidLines.join('\n')}\n` : '') +
      `Due date: ${args.dueDate}.\n\n` +
      `Pay from your resident dashboard.`,
  });
}

export function notifyVacatingUpdate(args: {
  customerId: string;
  bookingCode: string;
  status: 'submitted' | 'approved' | 'rejected' | 'completed';
  vacatingDate?: string;
  note?: string;
}): void {
  const statusLine =
    args.status === 'submitted'
      ? 'We received your vacating request.'
      : args.status === 'approved'
        ? 'Your vacating request has been approved.'
        : args.status === 'rejected'
          ? 'Your vacating request was not approved.'
          : 'Your vacating has been completed.';

  queueTenantNotification({
    customerId: args.customerId,
    notificationKind: 'vacating_update',
    subject: `Vacating update — ${args.bookingCode}`,
    text:
      `${statusLine}\n` +
      (args.vacatingDate ? `Vacating date: ${args.vacatingDate}.\n` : '') +
      (args.note ? `${args.note}\n` : '') +
      `\nBooking: ${args.bookingCode}.`,
  });
}

export function notifyExtensionUpdate(args: {
  customerId: string;
  bookingCode: string;
  status: 'requested' | 'paid' | 'rejected' | 'cancelled';
  newUntilDate?: string;
  amountPaise?: number;
}): void {
  const lines: string[] = [];
  if (args.status === 'requested') {
    lines.push(`Your stay extension request for booking ${args.bookingCode} was received.`);
    if (args.newUntilDate) lines.push(`Requested until: ${args.newUntilDate}.`);
    if (args.amountPaise != null) lines.push(`Quoted amount: ${paiseToInr(args.amountPaise)}.`);
  } else if (args.status === 'paid') {
    lines.push(`Your extension for booking ${args.bookingCode} is confirmed.`);
    if (args.newUntilDate) lines.push(`Extended until: ${args.newUntilDate}.`);
  } else if (args.status === 'rejected') {
    lines.push(`Your extension request for booking ${args.bookingCode} could not be approved.`);
  } else {
    lines.push(`Your pending extension for booking ${args.bookingCode} was cancelled.`);
  }

  queueTenantNotification({
    customerId: args.customerId,
    notificationKind: 'extension_update',
    subject: `Extension update — ${args.bookingCode}`,
    text: lines.join('\n'),
  });
}

export type EmailDeliveryMeta = {
  provider: 'resend' | 'smtp' | 'log';
  messageId?: string;
};

export async function notifyVerificationCode(args: {
  email: string;
  code: string;
}): Promise<{ ok: true; delivery: EmailDeliveryMeta } | { ok: false; message: string }> {
  const result = await sendEmail({
    to: args.email,
    subject: 'Your Awesome PG sign-in code',
    text:
      `Your sign-in code is ${args.code}.\n\n` +
      `It expires in a few minutes. If you did not request this, you can ignore this email.`,
    html:
      `<p>Your sign-in code is <strong>${args.code}</strong>.</p>` +
      `<p>It expires in a few minutes. If you did not request this, you can ignore this email.</p>`,
  });
  if (!result.ok) {
    return { ok: false, message: result.message };
  }
  return {
    ok: true,
    delivery: { provider: result.provider, messageId: result.messageId },
  };
}
