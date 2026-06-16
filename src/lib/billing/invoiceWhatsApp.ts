import { paiseToInr } from '@/src/lib/format';
import { whatsAppPhoneDigits } from '@/src/lib/kyc/adminWhatsApp';
import type { InvoiceBreakdown } from '@/src/db/schema/financialInvoices';

export function buildInvoiceWhatsAppMessage(input: {
  customerName: string;
  invoiceNumber: string;
  amountPaise: number;
  paymentLinkUrl?: string;
  breakdown?: InvoiceBreakdown | null;
}): string {
  const firstName = input.customerName.trim().split(/\s+/)[0] || 'there';
  const amount = paiseToInr(input.amountPaise);
  const lines = input.breakdown?.lines ?? [];
  const breakdownBlock =
    lines.length > 1
      ? '\n\nBreakdown:\n' +
        lines.map((l) => `• ${l.label}: ${paiseToInr(l.amountPaise)}`).join('\n')
      : '';

  if (input.paymentLinkUrl) {
    return (
      `Hi ${firstName},\n\n` +
      `Invoice #${input.invoiceNumber}\n\n` +
      `Amount Due:\n${amount}${breakdownBlock}\n\n` +
      `Pay here:\n${input.paymentLinkUrl}`
    );
  }
  return (
    `Hi ${firstName},\n\n` +
    `Invoice #${input.invoiceNumber}\n\n` +
    `Amount Due:\n${amount}${breakdownBlock}\n\n` +
    `Please contact the office for payment details.`
  );
}

export function buildInvoiceWhatsAppUrl(input: {
  customerName: string;
  customerPhone: string;
  invoiceNumber: string;
  amountPaise: number;
  paymentLinkUrl?: string;
  breakdown?: InvoiceBreakdown | null;
}): string | null {
  const digits = whatsAppPhoneDigits(input.customerPhone);
  if (!digits) return null;
  const text = buildInvoiceWhatsAppMessage(input);
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
