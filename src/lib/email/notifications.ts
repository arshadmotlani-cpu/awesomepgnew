import { eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { customers } from '@/src/db/schema';
import { paiseToInr } from '@/src/lib/format';
import { queueEmail, sendEmail } from './send';

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

export function notifyBookingConfirmed(args: {
  customerId: string;
  bookingCode: string;
  totalPaise: number;
}): void {
  void (async () => {
    const c = await customerEmail(args.customerId);
    if (!c) return;
    queueEmail({
      to: c.email,
      subject: `Booking confirmed — ${args.bookingCode}`,
      text:
        baseGreeting(c.name) +
        `Your booking ${args.bookingCode} is confirmed.\n` +
        `Total paid: ${paiseToInr(args.totalPaise)}.\n\n` +
        `View your booking in your Awesome PG account.`,
    });
  })();
}

export function notifyPaymentReceipt(args: {
  customerId: string;
  purpose: string;
  amountPaise: number;
  reference: string;
}): void {
  void (async () => {
    const c = await customerEmail(args.customerId);
    if (!c) return;
    queueEmail({
      to: c.email,
      subject: `Payment receipt — ${args.reference}`,
      text:
        baseGreeting(c.name) +
        `We received your ${args.purpose} payment of ${paiseToInr(args.amountPaise)}.\n` +
        `Reference: ${args.reference}.\n\n` +
        `Thank you for your payment.`,
    });
  })();
}

export function notifyRentReminder(args: {
  customerId: string;
  billingMonth: string;
  amountPaise: number;
  dueDate: string;
}): void {
  void (async () => {
    const c = await customerEmail(args.customerId);
    if (!c) return;
    queueEmail({
      to: c.email,
      subject: `Rent due — ${args.billingMonth}`,
      text:
        baseGreeting(c.name) +
        `Your rent for ${args.billingMonth} is ${paiseToInr(args.amountPaise)}.\n` +
        `Due date: ${args.dueDate}.\n\n` +
        `Pay from your resident dashboard.`,
    });
  })();
}

export function notifyElectricityReminder(args: {
  customerId: string;
  billingMonth: string;
  amountPaise: number;
  dueDate: string;
}): void {
  void (async () => {
    const c = await customerEmail(args.customerId);
    if (!c) return;
    queueEmail({
      to: c.email,
      subject: `Electricity bill — ${args.billingMonth}`,
      text:
        baseGreeting(c.name) +
        `Your electricity share for ${args.billingMonth} is ${paiseToInr(args.amountPaise)}.\n` +
        `Due date: ${args.dueDate}.\n\n` +
        `Pay from your resident dashboard.`,
    });
  })();
}

export function notifyVacatingUpdate(args: {
  customerId: string;
  bookingCode: string;
  status: 'submitted' | 'approved' | 'rejected' | 'completed';
  vacatingDate?: string;
  note?: string;
}): void {
  void (async () => {
    const c = await customerEmail(args.customerId);
    if (!c) return;
    const statusLine =
      args.status === 'submitted'
        ? 'We received your vacating request.'
        : args.status === 'approved'
          ? 'Your vacating request has been approved.'
          : args.status === 'rejected'
            ? 'Your vacating request was not approved.'
            : 'Your vacating has been completed.';
    queueEmail({
      to: c.email,
      subject: `Vacating update — ${args.bookingCode}`,
      text:
        baseGreeting(c.name) +
        `${statusLine}\n` +
        (args.vacatingDate ? `Vacating date: ${args.vacatingDate}.\n` : '') +
        (args.note ? `${args.note}\n` : '') +
        `\nBooking: ${args.bookingCode}.`,
    });
  })();
}

export function notifyExtensionUpdate(args: {
  customerId: string;
  bookingCode: string;
  status: 'requested' | 'paid' | 'rejected' | 'cancelled';
  newUntilDate?: string;
  amountPaise?: number;
}): void {
  void (async () => {
    const c = await customerEmail(args.customerId);
    if (!c) return;
    const lines: string[] = [baseGreeting(c.name)];
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
    queueEmail({
      to: c.email,
      subject: `Extension update — ${args.bookingCode}`,
      text: lines.join('\n'),
    });
  })();
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
