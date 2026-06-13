import { paiseToInr } from '@/src/lib/format';

export type AutomationTemplateContext = {
  name: string;
  pgName: string;
  amountPaise?: number;
  dueDate?: string;
  vacatingDate?: string;
  checkinDate?: string;
  checkoutDate?: string;
  paymentPurpose?: string;
};

export function renderAutomationTemplate(
  templateType: string,
  ctx: AutomationTemplateContext,
): { subject: string; body: string } {
  const amount =
    ctx.amountPaise != null ? paiseToInr(ctx.amountPaise) : 'the outstanding amount';

  switch (templateType) {
    case 'rent_reminder':
      return {
        subject: `Rent reminder — ${ctx.pgName}`,
        body:
          `Hi ${ctx.name}, your rent of ${amount} for ${ctx.pgName} is due on ${ctx.dueDate ?? 'the due date'}.\n` +
          `Please pay via UPI or QR to avoid late fees.`,
      };
    case 'rent_overdue':
      return {
        subject: `Rent overdue — ${ctx.pgName}`,
        body:
          `Hi ${ctx.name}, your rent is overdue. Please clear ${amount} immediately to avoid penalty.`,
      };
    case 'rent_overdue_admin':
      return {
        subject: `[Escalation] Rent overdue — ${ctx.name} @ ${ctx.pgName}`,
        body: `${ctx.name} has overdue rent of ${amount} at ${ctx.pgName}. Follow up in Collections.`,
      };
    case 'electricity_reminder':
      return {
        subject: `Electricity bill due — ${ctx.pgName}`,
        body:
          `Hi ${ctx.name}, your electricity share of ${amount} for ${ctx.pgName} is due on ${ctx.dueDate ?? 'the due date'}.\n` +
          `Please pay via the resident portal or QR.`,
      };
    case 'electricity_overdue':
      return {
        subject: `Electricity bill overdue — ${ctx.pgName}`,
        body:
          `Hi ${ctx.name}, your electricity bill of ${amount} is overdue. Please pay immediately.`,
      };
    case 'vacating_notice':
      return {
        subject: `Checkout scheduled — ${ctx.pgName}`,
        body:
          `Hi ${ctx.name}, your checkout is scheduled on ${ctx.vacatingDate ?? 'your vacating date'}. ` +
          `Please complete the handover process.`,
      };
    case 'checkin_reminder':
      return {
        subject: `Move-in reminder — ${ctx.pgName}`,
        body:
          `Hi ${ctx.name}, your check-in at ${ctx.pgName} is on ${ctx.checkinDate ?? 'your move-in date'}. ` +
          `Complete KYC and payment if pending.`,
      };
    case 'checkout_reminder':
      return {
        subject: `Checkout reminder — ${ctx.pgName}`,
        body:
          `Hi ${ctx.name}, your stay at ${ctx.pgName} ends on ${ctx.checkoutDate ?? 'your checkout date'}.`,
      };
    case 'kyc_reminder':
      return {
        subject: `KYC pending — ${ctx.pgName}`,
        body:
          `Hi ${ctx.name}, please complete your KYC for ${ctx.pgName} so we can verify your identity before move-in.`,
      };
    case 'payment_confirmation':
      return {
        subject: `Payment received — ${ctx.pgName}`,
        body:
          `Hi ${ctx.name}, we received your payment of ${amount}${ctx.paymentPurpose ? ` (${ctx.paymentPurpose})` : ''} for ${ctx.pgName}. Thank you!`,
      };
    case 'deposit_refund_pending':
      return {
        subject: `Deposit refund pending — ${ctx.pgName}`,
        body:
          `Hi ${ctx.name}, your deposit refund of ${amount} for ${ctx.pgName} is being processed after checkout.`,
      };
    default:
      return {
        subject: `Update from ${ctx.pgName}`,
        body: `Hi ${ctx.name}, you have an update regarding your stay at ${ctx.pgName}.`,
      };
  }
}
