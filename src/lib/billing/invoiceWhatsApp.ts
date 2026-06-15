import { paiseToInr } from '@/src/lib/format';
import { whatsAppPhoneDigits } from '@/src/lib/kyc/adminWhatsApp';

export function buildInvoiceWhatsAppMessage(input: {
  customerName: string;
  invoiceNumber: string;
  amountPaise: number;
  paymentLinkUrl?: string;
}): string {
  const firstName = input.customerName.trim().split(/\s+/)[0] || 'there';
  const amount = paiseToInr(input.amountPaise);
  if (input.paymentLinkUrl) {
    return (
      `Hi ${firstName},\n\n` +
      `Invoice #${input.invoiceNumber}\n\n` +
      `Amount Due:\n${amount}\n\n` +
      `Pay here:\n${input.paymentLinkUrl}`
    );
  }
  return (
    `Hi ${firstName},\n\n` +
    `Invoice #${input.invoiceNumber}\n\n` +
    `Amount Due:\n${amount}\n\n` +
    `Please contact the office for payment details.`
  );
}

export function buildInvoiceWhatsAppUrl(input: {
  customerName: string;
  customerPhone: string;
  invoiceNumber: string;
  amountPaise: number;
  paymentLinkUrl?: string;
}): string | null {
  const digits = whatsAppPhoneDigits(input.customerPhone);
  if (!digits) return null;
  const text = buildInvoiceWhatsAppMessage(input);
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
