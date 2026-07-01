/**
 * Official invoice collection WhatsApp messages — one invoice per message, public /i/{token} URL.
 */
import { paiseToInr } from '@/src/lib/format';
import { whatsAppPhoneDigits } from '@/src/lib/kyc/adminWhatsApp';
import type { FinancialInvoiceType } from '@/src/db/schema/enums';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

/** "2026-07-01" → "July" */
export function billingMonthLabel(billingMonth: string | null | undefined): string {
  if (!billingMonth || billingMonth.length < 7) return 'this month';
  const monthIndex = Number(billingMonth.slice(5, 7)) - 1;
  if (monthIndex < 0 || monthIndex > 11) return billingMonth.slice(0, 7);
  return MONTH_NAMES[monthIndex]!;
}

function residentGreeting(customerName: string): string {
  const first = customerName.trim().split(/\s+/)[0];
  return first || 'there';
}

export function buildRentCollectionWhatsAppMessage(input: {
  customerName: string;
  pgName: string;
  billingMonth: string | null;
  amountPaise: number;
  publicInvoiceUrl: string;
}): string {
  const month = billingMonthLabel(input.billingMonth);
  const amount = paiseToInr(input.amountPaise);
  return (
    `Hi ${residentGreeting(input.customerName)},\n\n` +
    `Your ${month} Rent invoice for ${input.pgName} is ready.\n\n` +
    `Amount:\n${amount}\n\n` +
    `Please review and pay using the secure link below.\n\n` +
    `${input.publicInvoiceUrl}\n\n` +
    `After payment upload the payment screenshot.\n\n` +
    `Thank you.`
  );
}

export function buildElectricityCollectionWhatsAppMessage(input: {
  customerName: string;
  billingMonth: string | null;
  amountPaise: number;
  publicInvoiceUrl: string;
}): string {
  const month = billingMonthLabel(input.billingMonth);
  const amount = paiseToInr(input.amountPaise);
  return (
    `Hi ${residentGreeting(input.customerName)},\n\n` +
    `Your ${month} Electricity bill is ready.\n\n` +
    `Amount:\n${amount}\n\n` +
    `Please review and pay using the secure link below.\n\n` +
    `${input.publicInvoiceUrl}\n\n` +
    `After payment upload the payment screenshot.\n\n` +
    `Thank you.`
  );
}

export function buildGenericInvoiceCollectionWhatsAppMessage(input: {
  customerName: string;
  invoiceNumber: string;
  amountPaise: number;
  publicInvoiceUrl: string;
}): string {
  const amount = paiseToInr(input.amountPaise);
  return (
    `Hi ${residentGreeting(input.customerName)},\n\n` +
    `Your invoice ${input.invoiceNumber} is ready.\n\n` +
    `Amount:\n${amount}\n\n` +
    `Please review and pay using the secure link below.\n\n` +
    `${input.publicInvoiceUrl}\n\n` +
    `After payment upload the payment screenshot.\n\n` +
    `Thank you.`
  );
}

export function buildCollectionWhatsAppMessageForInvoiceType(input: {
  invoiceType: FinancialInvoiceType;
  customerName: string;
  pgName: string;
  invoiceNumber: string;
  billingMonth: string | null;
  amountPaise: number;
  publicInvoiceUrl: string;
}): string {
  if (input.invoiceType === 'rent') {
    return buildRentCollectionWhatsAppMessage({
      customerName: input.customerName,
      pgName: input.pgName,
      billingMonth: input.billingMonth,
      amountPaise: input.amountPaise,
      publicInvoiceUrl: input.publicInvoiceUrl,
    });
  }
  if (input.invoiceType === 'electricity') {
    return buildElectricityCollectionWhatsAppMessage({
      customerName: input.customerName,
      billingMonth: input.billingMonth,
      amountPaise: input.amountPaise,
      publicInvoiceUrl: input.publicInvoiceUrl,
    });
  }
  return buildGenericInvoiceCollectionWhatsAppMessage({
    customerName: input.customerName,
    invoiceNumber: input.invoiceNumber,
    amountPaise: input.amountPaise,
    publicInvoiceUrl: input.publicInvoiceUrl,
  });
}

export function buildCollectionWhatsAppUrl(input: {
  customerPhone: string;
  message: string;
}): string | null {
  const digits = whatsAppPhoneDigits(input.customerPhone);
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(input.message)}`;
}
